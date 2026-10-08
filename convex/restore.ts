/**
 * Restore — turning an uploaded backup file back into live records.
 *
 * Split deliberately into two calls:
 *
 *  1. `analyze` reads the file and reports what it contains and what it would
 *     do. It writes nothing, so the operator can see the consequences first.
 *  2. `execute` performs the restore, and only then.
 *
 * The hard part is that ids in the file refer to the machine that produced the
 * backup. Restoring naively would write those ids straight in and produce a
 * database where every reference points at nothing. So every row is inserted
 * with freshly generated ids and a translation map (old id → new id) is carried
 * forward, then used to rewrite every foreign key as it goes. Tables are
 * visited in dependency order (see `RESTORE_ORDER`) so a referenced row always
 * exists before the row that points at it.
 *
 * MERGE keeps what is already here and only fills in what is missing, matching
 * on the real business key (employees by NIY, users by email, units by kode).
 * REPLACE wipes the domain tables first, which is the only honest way to make a
 * backup authoritative — anything else would leave a half-old, half-new mix.
 */

import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  RESTORE_FOREIGN_KEYS,
  RESTORE_NATURAL_KEYS,
  RESTORE_ORDER,
  RESTORE_SKIPPED_TABLES,
  inspectSnapshot,
  naturalKeyOf,
  type RestoreMode,
} from "../src/domain/restore";
import { requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";

/** Every table the restore touches is addressed dynamically, so alias the types. */
type AnyTable = Parameters<QueryCtx["db"]["query"]>[0];
type AnyDoc = Doc<AnyTable>;

/**
 * Stable fingerprint of a row's content, ignoring the machine-specific id.
 *
 * Used to recognise a row that already exists when the table has no business
 * key. Keys are sorted so field order in the file cannot change the result, and
 * values are stringified so nested objects compare predictably.
 */
function signatureOf(row: Record<string, unknown>): string {
  const entries = Object.entries(row)
    .filter(([key]) => key !== "_id" && key !== "_creationTime")
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return entries
    .map(([key, value]) => `${key}=${value === undefined ? "" : JSON.stringify(value) ?? ""}`)
    .join("");
}

/** Never readable from the browser, only by the restore flow itself. */
export const restoreSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const mode = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "backup"))
      .unique();
    return mode?.value as { restoreMode?: RestoreMode; lastRestoreAt?: number } | undefined;
  },
});

/**
 * Existing business keys, so the operator can be told in advance how much of the
 * file is genuinely new versus already present.
 */
async function existingNaturalKeys(ctx: QueryCtx): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {};
  for (const table of Object.keys(RESTORE_NATURAL_KEYS)) {
    const rows = await ctx.db.query(table as never).collect();
    const keys = new Set<string>();
    for (const row of rows) {
      const key = naturalKeyOf(table, row as Record<string, unknown>);
      if (key) keys.add(key);
    }
    out[table] = keys;
  }
  return out;
}

/**
 * Step 1 — inspect the uploaded file. Writes nothing.
 * Public so the browser can call it with the parsed JSON directly.
 */
export const analyze = mutation({
  args: { snapshot: v.any() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return inspectSnapshot(args.snapshot, await existingNaturalKeys(ctx));
  },
});

/**
 * Step 2 — apply the restore.
 *
 * Runs as an action so it can be cancelled safely: a mutation of this size
 * would be one enormous transaction, and Convex limits documents scanned and
 * written per transaction. Splitting into per-table mutations keeps each one
 * small and reports progress.
 */
export const execute = action({
  args: {
    snapshot: v.any(),
    mode: v.union(v.literal("REPLACE"), v.literal("MERGE")),
    /** The operator must retype the row count, so a restore is never accidental. */
    confirmRowCount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.runQuery(internal.restore.actor, {});
    if (!identity) throw new Error("UNAUTHENTICATED");

    const file = args.snapshot as Record<string, unknown>;
    if (file.format !== "hris-piat6-backup") {
      throw new Error("FORBIDDEN_FORMAT: berkas bukan cadangan HRIS PIAT 6");
    }
    const rowsByTable = (file.tables ?? {}) as Record<string, unknown[]>;
    const totalRows = Object.values(rowsByTable).reduce(
      (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
      0,
    );
    if (args.confirmRowCount !== totalRows) {
      throw new Error(
        `KONFIRMASI_GAGAL: berkas berisi ${totalRows} baris, Anda mengonfirmasi ${args.confirmRowCount}.`,
      );
    }

    if (args.mode === "REPLACE") {
      const cleared = await ctx.runMutation(internal.restore.clearDomain, {});
      console.log(`restore REPLACE: ${cleared} baris lama dihapus`);
    }

    // oldId -> newId, per table, carried across every table as we go.
    const idMap: Record<string, Record<string, string>> = {};
    const report: Record<string, { inserted: number; merged: number }> = {};
    const problems: string[] = [];

    for (const table of RESTORE_ORDER) {
      if (RESTORE_SKIPPED_TABLES.has(table)) continue;
      const rows = rowsByTable[table];
      if (!Array.isArray(rows) || rows.length === 0) {
        report[table] = { inserted: 0, merged: 0 };
        continue;
      }
      const result = await ctx.runMutation(internal.restore.writeTable, {
        table,
        rows,
        mode: args.mode,
        idMap,
      });
      // Convex serialises arguments, so the mutation's own copy of `idMap` is
      // thrown away when it returns. The delta has to be merged back here or
      // every table after the first would see an empty map and drop its
      // references.
      const delta = result.idMap as Record<string, Record<string, string>>;
      for (const [mappedTable, mapping] of Object.entries(delta)) {
        idMap[mappedTable] = { ...idMap[mappedTable], ...mapping };
      }
      report[table] = result.counts;
      if (result.problems.length) {
        problems.push(...result.problems.map((p: string) => `${table}: ${p}`));
      }
      console.log(`restore ${table}: ${result.counts.inserted} baru, ${result.counts.merged} digabung`);
    }

    await ctx.runMutation(internal.restore.audit, {
      mode: args.mode,
      totalRows,
      summary: problems.slice(0, 3),
    });

    const inserted = Object.values(report).reduce((sum, c) => sum + c.inserted, 0);
    const merged = Object.values(report).reduce((sum, c) => sum + c.merged, 0);
    return { inserted, merged, problems, perTable: report };
  },
});

/** Current identity, used by the action because actions cannot read the db. */
export const actor = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return { id: user.id, name: user.name, role: user.role };
  },
});

void (0 as unknown as AnyDoc);

/**
 * Insert or merge one table, translating every foreign key through `idMap`.
 *
 * Two passes over the rows: the first inserts records that have no unresolved
 * self-reference, the second patches the ones that did (unit → parent unit,
 * employee → own user account). Without the second pass a self-referencing
 * hierarchy would be impossible to rebuild in one sweep.
 */
export const writeTable = internalMutation({
  args: {
    table: v.string(),
    rows: v.array(v.any()),
    mode: v.string(),
    idMap: v.any(),
  },
  handler: async (ctx, args) => {
    const table = args.table as AnyTable;
    const mode = args.mode as RestoreMode;
    const idMap = args.idMap as Record<string, Record<string, string>>;
    const foreignKeys = RESTORE_FOREIGN_KEYS[table] ?? {};
    const naturalKeys = RESTORE_NATURAL_KEYS[table];

    // What is already here, keyed for MERGE matching.
    const existingByNatural = new Map<string, string>();
    const existingBySignature = new Map<string, string>();
    const existingByOldId = new Map<string, string>();
    if (mode === "MERGE") {
      const current = (await ctx.db.query(table).collect()) as unknown as Record<string, unknown>[];
      for (const record of current) {
        const key = naturalKeyOf(table, record);
        if (key) existingByNatural.set(key, String(record._id));
        // Tables without a business key (attendance rows, position assignments)
        // would otherwise be inserted again on every merge, doubling the data.
        // A content signature catches the row that is already there.
        existingBySignature.set(signatureOf(record), String(record._id));
        if (record._id) existingByOldId.set(String(record._id), String(record._id));
      }
    }

    const counts = { inserted: 0, merged: 0 };
    const problems: string[] = [];
    // Rows waiting on a self-reference, patched at the end of this table.
    const deferred: { id: string; patch: Record<string, unknown> }[] = [];

    for (const raw of args.rows) {
      if (!raw || typeof raw !== "object") continue;
      const source = raw as Record<string, unknown>;
      const oldId = typeof source._id === "string" ? source._id : null;

      // Drop ids we must not trust from the file.
      const { _id: _ignoredId, _creationTime: _ignoredTime, ...fields } = source;

      // MERGE: an existing row with the same business key is left alone, and
      // its current id is what any new references should point at.
      if (mode === "MERGE" && naturalKeys && oldId && existingByOldId.has(oldId)) {
        idMap[table] ??= {};
        idMap[table][oldId] = existingByOldId.get(oldId)!;
        counts.merged += 1;
        continue;
      }
      if (mode === "MERGE" && naturalKeys) {
        const key = naturalKeyOf(table, fields);
        if (key && existingByNatural.has(key)) {
          const existingId = existingByNatural.get(key)!;
          if (oldId) {
            idMap[table] ??= {};
            idMap[table][oldId] = existingId;
          }
          counts.merged += 1;
          continue;
        }
      }

      // Translate every reference that we already know how to resolve.
      const payload: Record<string, unknown> = { ...fields };
      const patch: Record<string, unknown> = {};
      for (const [field, targetTable] of Object.entries(foreignKeys)) {
        const value = payload[field];
        if (value === undefined || value === null) continue;
        const translated = idMap[targetTable]?.[String(value)];
        if (translated) {
          payload[field] = translated;
        } else if (targetTable === table) {
          // Self-reference: the target row may not exist yet.
          patch[field] = value;
          delete payload[field];
        } else {
          // The referenced table was absent from the file; drop the dangling
          // link rather than write an id that resolves to nothing.
          delete payload[field];
          problems.push(`baris tanpa id: ${field} → ${targetTable}`);
        }
      }

      if (mode === "MERGE") {
        // Content matching runs AFTER the references are translated, because the
        // backup holds the source machine's ids while the live rows hold ours —
        // comparing raw content across the two would never match. This is what
        // stops a repeated restore from duplicating child rows.
        const signature = signatureOf(payload);
        const existingId = existingBySignature.get(signature);
        if (existingId) {
          if (oldId) {
            idMap[table] ??= {};
            idMap[table][oldId] = existingId;
          }
          counts.merged += 1;
          continue;
        }
        existingBySignature.set(signature, "pending");
      }

      try {
        const newId = await ctx.db.insert(table, payload as never);
        counts.inserted += 1;
        if (oldId) {
          idMap[table] ??= {};
          idMap[table][oldId] = newId as string;
        }
        if (Object.keys(patch).length) deferred.push({ id: newId as string, patch });
      } catch (error) {
        problems.push(`gagal menyimpan: ${String(error).slice(0, 120)}`);
      }
    }

    // Second pass: resolve the self-references now that every row exists.
    for (const item of deferred) {
      const resolved: Record<string, unknown> = {};
      let resolvable = true;
      for (const [field, targetTable] of Object.entries(foreignKeys)) {
        const translated = idMap[targetTable]?.[String(item.patch[field])];
        if (translated) resolved[field] = translated;
        else resolvable = false;
      }
      if (resolvable) await ctx.db.patch(item.id as never, resolved as never);
    }

    return { counts, problems, idMap };
  },
});

/**
 * REPLACE mode: clear the domain tables.
 *
 * Ordered so children go before parents, otherwise a parent delete would fail
 * with a reference error. Sessions and backup snapshots are deliberately kept —
 * those belong to the running system, not to the data being restored.
 */
export const clearDomain = internalMutation({
  args: {},
  handler: async (ctx) => {
    const reverse: string[] = [...RESTORE_ORDER].reverse();
    let cleared = 0;
    for (const table of reverse) {
      if (RESTORE_SKIPPED_TABLES.has(table)) continue;
      const rows = await ctx.db.query(table as AnyTable).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
        cleared += 1;
      }
    }
    return cleared;
  },
});

/** Record the restore in the audit trail. */
export const audit = internalMutation({
  args: { mode: v.string(), totalRows: v.number(), summary: v.array(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "restore",
      summary: `Pemulihan data (${args.mode === "REPLACE" ? "Timpa total" : "Gabungkan"}): ${args.totalRows} baris dari berkas cadangan`,
      metadata: {
        mode: args.mode,
        baris: args.totalRows,
        catatan: args.summary.join(" | ") || "-",
      },
    });
    // Remember the chosen mode so the next restore starts from the same habit.
    const existing = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "backup"))
      .unique();
    const value = {
      ...((existing?.value as Record<string, unknown>) ?? {}),
      restoreMode: args.mode,
      lastRestoreAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    else await ctx.db.insert("settings", { key: "backup", value, updatedAt: Date.now() });
    return { ok: true };
  },
});

export { RESTORE_ORDER, RESTORE_FOREIGN_KEYS };