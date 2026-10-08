/**
 * Backup snapshots — the safety net for an HRIS whose only copy lives on a
 * free-tier backend that offers no automated backups.
 *
 * Two layers, and the difference matters:
 *
 *  1. OFF-PLATFORM (the real archive) — the operator downloads a JSON file and
 *     keeps it on Google Drive. Only this survives the project being deleted.
 *  2. ON-PLATFORM (the safety net) — a daily cron writes the same JSON into
 *     Convex file storage. This protects against the far more likely failure:
 *     a bad import, or somebody deleting records by accident. It rotates, so it
 *     cannot grow without bound.
 *
 * Convex splits reading and writing storage: a query/mutation may read the
 * database but `storage.store()` only exists in an action. So every stored
 * snapshot is built by a query and persisted by an action.
 *
 * Two modes, because a backup has two audiences:
 *  - `safe` drops NIK / BPJS / rekening. Used by the cron and for shareable copies.
 *  - `full` keeps them, and is refused without HR_SENSITIVE_VIEW.
 *
 * Password hashes and live session tokens are NEVER exported in either mode —
 * a backup is a data archive, not a credential store.
 */

import { internalAction, internalMutation, internalQuery, mutation, action, query } from "./_generated/server";
import { v } from "convex/values";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { PERMISSIONS } from "../src/domain/permissions";
import { SENSITIVE_EMPLOYEE_FIELDS } from "./lib/employeeRepository";
import { hasPermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";

/**
 * Every table, in dependency order so the file reads top-down like the schema.
 * `sessions`, `bootReports` and `backupSnapshots` are intentionally absent —
 * none are data an operator needs to restore, and `sessions` is a credential
 * store rather than business data.
 */
const BACKUP_TABLES = [
  "users",
  "organizationUnits",
  "positions",
  "positionAssignments",
  "employees",
  "contracts",
  "attendanceRecords",
  "leaveRequests",
  "leaveHistory",
  "leaveBalances",
  "payrollComponents",
  "salaryStructures",
  "payrollPeriods",
  "payslips",
  "benefits",
  "educationRecords",
  "competencies",
  "employeeCompetencies",
  "trainings",
  "trainingParticipants",
  "performanceIndicators",
  "performanceAssessments",
  "performanceScores",
  "disciplineRecords",
  "documents",
  "mutations",
  "resignations",
  "importSessions",
  "auditLogs",
  "settings",
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

/** How many on-platform snapshots to keep. Ten days of history is plenty. */
const ROTATION_LIMIT = 10;

/** Columns that must never leave the backend, in any backup mode. */
const NEVER_EXPORTED = new Set(["passwordHash"]);

/**
 * Nested places that carry sensitive copies of employee data.
 *
 * `importSessions.summary.rows[].values` holds the RAW spreadsheet cells the
 * operator approved, including NIK, BPJS and rekening. Redacting only the top
 * level of a row would leave every one of those values intact in the file, so
 * the walk below replaces them with a count instead of copying them.
 *
 * `auditLogs.actorEmail` is an address, not employee data, and is kept — the
 * audit trail is useless without knowing who did what.
 */
const NESTED_REDACTIONS: { key: string; child: string; reason: string }[] = [
  {
    key: "summary",
    child: "rows",
    reason: "sel spreadsheet mentah termasuk NIK/BPJS/rekening",
  },
];

/** Replace a nested object with a shape-safe summary of what it held. */
function redactNested(value: unknown, reason: string): Record<string, unknown> {
  if (Array.isArray(value)) {
    return {
      redacted: true,
      reason,
      count: value.length,
      note: "Nilai asli tidak disertakan pada mode aman",
    };
  }
  if (value && typeof value === "object") {
    return {
      redacted: true,
      reason,
      keys: Object.keys(value as Record<string, unknown>).length,
      note: "Nilai asli tidak disertakan pada mode aman",
    };
  }
  return { redacted: true, reason };
}

function stripNeverExported(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (NEVER_EXPORTED.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function stripSensitive(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (NEVER_EXPORTED.has(key)) continue;
    if ((SENSITIVE_EMPLOYEE_FIELDS as readonly string[]).includes(key)) continue;
    // Walk known nested containers that mirror the top-level sensitive columns.
    let shaped = value;
    for (const rule of NESTED_REDACTIONS) {
      if (key !== rule.key) continue;
      const container = value as Record<string, unknown> | undefined;
      if (!container || container[rule.child] === undefined) continue;
      shaped = { ...container, [rule.child]: redactNested(container[rule.child], rule.reason) };
    }
    out[key] = shaped;
  }
  return out;
}

export interface Snapshot {
  format: string;
  version: number;
  mode: "safe" | "full";
  generatedAt: number;
  generatedBy: { name: string; email: string; role: string } | null;
  counts: Record<string, number>;
  totalRows: number;
  tables: Record<string, unknown[]>;
}

/** Read every table once and apply the redaction policy. Pure read. */
async function buildSnapshot(
  ctx: QueryCtx,
  mode: "safe" | "full",
  actor: Snapshot["generatedBy"],
): Promise<Snapshot> {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = await ctx.db.query(table).collect();
    const shaped = rows.map((row) =>
      mode === "full"
        ? stripNeverExported(row as Record<string, unknown>)
        : stripSensitive(row as Record<string, unknown>),
    );
    tables[table] = shaped;
    counts[table] = shaped.length;
  }
  return {
    format: "hris-piat6-backup",
    version: 1,
    mode,
    generatedAt: Date.now(),
    generatedBy: actor,
    counts,
    totalRows: Object.values(counts).reduce((sum, n) => sum + n, 0),
    tables,
  };
}

/** `PIAT6-BACKUP-2026-10-01T15-04-22.json` — sorts chronologically anywhere. */
function snapshotFilename(generatedAt: number): string {
  const iso = new Date(generatedAt).toISOString();
  return `PIAT6-BACKUP-${iso.slice(0, 10)}T${iso.slice(11, 19).replace(/:/g, "-")}.json`;
}

/** Insert the ledger row, then delete any snapshot past the rotation limit. */
export const recordSnapshot = internalMutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    mode: v.string(),
    totalRows: v.number(),
    counts: v.any(),
    sizeBytes: v.optional(v.number()),
    trigger: v.string(),
    actorEmail: v.optional(v.string()),
    generatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = args.actorEmail
      ? await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", args.actorEmail!))
          .unique()
      : null;
    await ctx.db.insert("backupSnapshots", {
      storageId: args.storageId,
      filename: args.filename,
      mode: args.mode,
      totalRows: args.totalRows,
      counts: args.counts,
      sizeBytes: args.sizeBytes,
      trigger: args.trigger,
      createdBy: user?._id,
      createdAt: args.generatedAt,
    });

    const existing = await ctx.db.query("backupSnapshots").order("desc").collect();
    const stale = existing.slice(ROTATION_LIMIT);
    for (const snapshot of stale) {
      await ctx.db.delete(snapshot._id);
    }
    // File deletion needs the action's writer, so hand the ids back.
    return { pruned: stale.length, staleIds: stale.map((s) => s.storageId) };
  },
});

/** Store the blob, record it, and delete the rotated-out files. */
async function storeAndRotate(
  ctx: ActionCtx,
  snapshot: Snapshot,
  trigger: "CRON" | "MANUAL",
): Promise<{ storageId: string; filename: string; pruned: number; totalRows: number }> {
  const filename = snapshotFilename(snapshot.generatedAt);
  const body = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const storageId = await ctx.storage.store(body);
  const { staleIds } = await ctx.runMutation(internal.backup.recordSnapshot, {
    storageId,
    filename,
    mode: snapshot.mode,
    totalRows: snapshot.totalRows,
    counts: snapshot.counts,
    sizeBytes: body.size,
    trigger,
    actorEmail: snapshot.generatedBy?.email,
    generatedAt: snapshot.generatedAt,
  });
  for (const staleId of staleIds) {
    await ctx.storage.delete(staleId);
  }
  console.log(`storeAndRotate ${filename}: ${snapshot.totalRows} baris, ${staleIds.length} lama dihapus`);
  return { storageId, filename, pruned: staleIds.length, totalRows: snapshot.totalRows };
}

/**
 * Snapshot for the scheduled job.
 *
 * Runs in `full` mode because the archive exists to be restorable: a `safe`
 * snapshot silently drops NIK, BPJS and rekening, so restoring it would give
 * back records with those columns empty. The file stays on the platform next to
 * the very same values in the database, so this widens no trust boundary.
 */
export const cronSnapshotPayload = internalQuery({
  args: {},
  handler: async (ctx) => buildSnapshot(ctx, "full", null),
});

/** Snapshot for an authenticated operator; `full` needs HR_SENSITIVE_VIEW. */
export const manualSnapshotPayload = internalQuery({
  args: { mode: v.optional(v.union(v.literal("safe"), v.literal("full"))) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const mode = args.mode ?? "safe";
    if (mode === "full" && !hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW)) {
      throw new Error("FORBIDDEN:HR_SENSITIVE_VIEW");
    }
    return buildSnapshot(ctx, mode, { name: user.name, email: user.email, role: user.role });
  },
});

/** Cron entry point — scheduled by `convex/crons.ts`. */
export const cronSnapshot = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    storageId: string;
    filename: string;
    pruned: number;
    totalRows: number;
  }> => {
    const snapshot: Snapshot = await ctx.runQuery(internal.backup.cronSnapshotPayload, {});
    return await storeAndRotate(ctx, snapshot, "CRON");
  },
});

/** Manual entry point from the Settings screen. */
export const saveSnapshot = action({
  args: { mode: v.optional(v.union(v.literal("safe"), v.literal("full"))) },
  handler: async (ctx, args): Promise<{
    storageId: string;
    filename: string;
    totalRows: number;
    pruned: number;
  }> => {
    const snapshot: Snapshot = await ctx.runQuery(internal.backup.manualSnapshotPayload, {
      mode: args.mode ?? "safe",
    });
    const result = await storeAndRotate(ctx, snapshot, "MANUAL");
    await ctx.runMutation(internal.backup.auditSnapshot, {
      mode: snapshot.mode,
      totalRows: snapshot.totalRows,
      trigger: "MANUAL",
    });
    return result;
  },
});

/** Audit row for a manual save — actions cannot call writeAudit themselves. */
export const auditSnapshot = internalMutation({
  args: { mode: v.string(), totalRows: v.number(), trigger: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.EXPORT,
      entity: "backup",
      summary: `Cadangan ${args.mode === "full" ? "lengkap" : "aman"} disimpan: ${args.totalRows} baris`,
      metadata: { mode: args.mode, baris: args.totalRows, hashSandi: "tidak disertakan" },
    });
    return { ok: true };
  },
});

/** Manual download. `safe` strips sensitive columns; `full` needs the permission. */
export const createSnapshot = mutation({
  args: {
    mode: v.optional(v.union(v.literal("safe"), v.literal("full"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const mode = args.mode ?? "safe";
    if (mode === "full" && !hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW)) {
      throw new Error("FORBIDDEN:HR_SENSITIVE_VIEW");
    }
    const snapshot = await buildSnapshot(ctx, mode, {
      name: user.name,
      email: user.email,
      role: user.role,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.EXPORT,
      entity: "backup",
      summary: `Backup ${mode === "full" ? "lengkap" : "aman"} diunduh: ${snapshot.totalRows} baris`,
      metadata: {
        mode,
        tabel: BACKUP_TABLES.length,
        baris: snapshot.totalRows,
        hashSandi: "tidak disertakan",
      },
    });
    return snapshot;
  },
});

/** Metadata for the settings screen — never the payload itself. */
export const history = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!hasPermission(user, PERMISSIONS.HR_SETTINGS)) {
      throw new Error("FORBIDDEN:HR_SETTINGS");
    }
    const rows = await ctx.db.query("backupSnapshots").order("desc").take(ROTATION_LIMIT);
    const users = await ctx.db.query("users").collect();
    const nameById = new Map(users.map((u) => [u._id, u.name]));
    return rows.map((row) => ({
      id: row._id,
      filename: row.filename,
      mode: row.mode,
      totalRows: row.totalRows,
      sizeBytes: row.sizeBytes,
      trigger: row.trigger,
      createdAt: row.createdAt,
      createdByName: row.createdBy ? nameById.get(row.createdBy) : null,
    }));
  },
});

/** Download URL for one stored snapshot. Audited, because it is a data export. */
export const snapshotUrl = mutation({
  args: { id: v.id("backupSnapshots") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!hasPermission(user, PERMISSIONS.HR_SETTINGS)) {
      throw new Error("FORBIDDEN:HR_SETTINGS");
    }
    const snapshot = await ctx.db.get(args.id);
    if (!snapshot) throw new Error("NOT_FOUND");
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.EXPORT,
      entity: "backup",
      recordId: args.id,
      summary: `Unduh ${snapshot.filename}`,
      metadata: { mode: snapshot.mode, baris: snapshot.totalRows },
    });
    return await ctx.storage.getUrl(snapshot.storageId);
  },
});

export { BACKUP_TABLES, snapshotFilename, ROTATION_LIMIT };
export type { BackupTable };