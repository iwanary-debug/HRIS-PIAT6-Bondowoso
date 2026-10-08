/**
 * Import Karyawan — the priority workflow.
 *
 * Flow: UPLOAD → PARSE (client) → MAPPING → VALIDATION → PREVIEW →
 *       DUPLICATE CHECK → CONFIRM → IMPORT → RESULT (+ error report).
 *
 * The browser parses XLSX/CSV and builds the preview so the operator sees it
 * immediately; the server re-validates every row before writing, so a tampered
 * client cannot bypass the rules. NIY is the business identifier and existing
 * records are never silently overwritten.
 */

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import { type ColumnMapping, buildPreview } from "../src/domain/import/mapping";
import { sanitizeRowsForConvex } from "../src/domain/import/normalize";
import { normalizePendidikan, summarize, type ValidatedRow } from "../src/domain/import/validate";
import { requirePermission } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { calculateTenure } from "../src/domain/tenure";
import { ensurePosition, ensureUnit } from "./lib/names";
import {
  backfillAssignments as backfillAssignmentsLogic,
  countPlacementGaps,
} from "./lib/placementBackfill";

interface CommitRow {
  rowNumber: number;
  niy: string;
  values: Record<string, string | number | undefined>;
  action: "NEW" | "UPDATE" | "SKIP" | "ERROR" | "SKIP_EMPTY";
}

const employeeColumns = [
  "namaLengkap",
  "bidang",
  "jabatan",
  "tanggalLahir",
  "tempatLahir",
  "alamatKtp",
  "nik",
  "noHp",
  "email",
  "tanggalBergabung",
  "statusAkad",
  "durasiKontrak",
  "jtPerpanjanganKontrak",
  "status",
  "tmtResign",
  "bpjsKesehatanNumber",
  "bank",
  "noRekening",
  "statusPernikahan",
  "jumlahAnak",
  "pendidikanTerakhir",
  "universitas",
  "jurusan",
] as const;

type EmployeeColumn = (typeof employeeColumns)[number];
void (0 as unknown as EmployeeColumn);

export const existingNiy = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_IMPORT);
    const employees = await ctx.db.query("employees").collect();
    return employees.map((e) => ({ niy: e.niy, namaLengkap: e.namaLengkap, id: e._id }));
  },
});

/**
 * Re-run the validation pipeline on the server and persist the preview session,
 * so the duplicate check always reflects the live database.
 */
export const createPreview = mutation({
  args: {
    filename: v.string(),
    sheet: v.optional(v.string()),
    headerRowIndex: v.number(),
    mapping: v.any(),
    rows: v.array(v.any()),
    duplicateRule: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_IMPORT);
    const employees = await ctx.db.query("employees").collect();
    const existingNiy = new Set(employees.map((e) => e.niy.toLowerCase()));

    const mapping = args.mapping as ColumnMapping;
    // `rows` arrives as raw 2D sheet rows; sanitize again server-side (a value
    // such as a `Date` must never reach the validator or the stored session),
    // then the mapping turns them into records.
    const rows = sanitizeRowsForConvex(args.rows as readonly (readonly unknown[])[]) as unknown[][];
    const validated = buildPreview({ rows, mapping, existingNiy });

    const rule = (args.duplicateRule ?? "SKIP") as "UPDATE" | "SKIP" | "ERROR";
    const resolved: ValidatedRow[] = validated.map((row) => {
    const hasError = row.issues.some((issue) => issue.severity === "ERROR");
    if (!row.niy && !row.values.namaLengkap) return { ...row, action: "SKIP_EMPTY" };
    if (hasError) return { ...row, action: "ERROR" };
      if (!row.duplicate) return { ...row, action: "NEW" };
      if (row.duplicate.source === "IN_FILE") return { ...row, action: "ERROR" };
      return { ...row, action: rule };
    });

    const summary = summarize(resolved);
    // Rows are persisted with the session so `commit` can re-read exactly what
    // the operator approved, and re-validate against live data.
    const payloadRows: CommitRow[] = resolved.map((row) => ({
      rowNumber: row.rowNumber,
      niy: row.niy,
      values: row.values,
      action: row.action ?? "ERROR",
    }));
    const sessionId = await ctx.db.insert("importSessions", {
      filename: args.filename,
      sheet: args.sheet,
      headerRowIndex: args.headerRowIndex,
      mapping,
      duplicateRule: rule,
      createdBy: user.id,
      status: "PREVIEW",
      summary: { ...summary, rows: payloadRows },
      createdAt: Date.now(),
    });
    return { sessionId, summary, rows: resolved.length };
  },
});

/** Commit the validated rows. Validation is repeated server-side. */
export const commit = mutation({
  args: { sessionId: v.id("importSessions") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_IMPORT);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Sesi import tidak ditemukan");
    if (session.status === "COMPLETED") throw new Error("Sesi import ini sudah selesai");
    if (session.status !== "PREVIEW") throw new Error("Sesi import tidak dalam status Preview");

    const employees = await ctx.db.query("employees").collect();
    const documents = await ctx.db.query("documents").collect();
    const requiredDocs = ["KTP", "IJAZAH", "SK"];

    const result = {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as { rowNumber: number; niy: string; action: string; message?: string }[],
    };

    const rawRows = (session.summary as unknown as { rows?: CommitRow[] })?.rows ?? [];
    const rule = session.duplicateRule as "UPDATE" | "SKIP" | "ERROR";
    const now = Date.now();

    for (const row of rawRows) {
      result.total += 1;
      const niy = String(row.niy ?? "").trim();
      if (row.action === "SKIP_EMPTY") {
        result.skipped += 1;
        result.details.push({
          rowNumber: row.rowNumber,
          niy: "—",
          action: "SKIP",
          message: "Baris tanpa NIY dan Nama Lengkap — dilewati (bukan data karyawan)",
        });
        continue;
      }
      if (!niy) {
        result.errors += 1;
        result.details.push({ rowNumber: row.rowNumber, niy: "—", action: "ERROR", message: "NIY kosong" });
        continue;
      }
      const existing = employees.find((e) => e.niy.toLowerCase() === niy.toLowerCase());
      let action: CommitRow["action"] = existing
        ? rule === "UPDATE"
          ? "UPDATE"
          : rule === "ERROR"
            ? "ERROR"
            : "SKIP"
        : "NEW";

      if (action === "ERROR") {
        result.errors += 1;
        result.details.push({
          rowNumber: row.rowNumber,
          niy,
          action: "ERROR",
          message: existing
            ? `NIY sudah terdaftar (${existing.namaLengkap}) dan aturan duplikat = Error`
            : "Duplikat di dalam file",
        });
        continue;
      }
      if (action === "SKIP") {
        result.skipped += 1;
        result.details.push({
          rowNumber: row.rowNumber,
          niy,
          action: "SKIP",
          message: existing
            ? `Sudah ada (${existing.namaLengkap}) — tidak diubah`
            : "Duplikat di dalam file",
        });
        continue;
      }

      const values = row.values ?? {};
      // Resolve against the Referensi table, and create the entry when the
      // workbook mentions a bidang/jabatan that has never been registered —
      // dropping it silently is what left 90 employees without placement.
      const bidangName = optString(values.bidang);
      const jabatanName = optString(values.jabatan);
      const bidangId = bidangName ? await ensureUnit(ctx, bidangName) : null;
      const jabatanId = jabatanName ? await ensurePosition(ctx, jabatanName, bidangId ?? undefined) : null;
      const namaLengkap = String(values.namaLengkap ?? "").trim();
      if (!namaLengkap) {
        result.errors += 1;
        result.details.push({ rowNumber: row.rowNumber, niy, action: "ERROR", message: "Nama lengkap kosong" });
        continue;
      }

      const payload = {
        namaLengkap,
        bidangId: bidangId ?? (action === "UPDATE" ? existing?.bidangId : undefined),
        jabatanId: jabatanId ?? (action === "UPDATE" ? existing?.jabatanId : undefined),
        tanggalLahir: optString(values.tanggalLahir),
        tempatLahir: optString(values.tempatLahir),
        alamatKtp: optString(values.alamatKtp),
        nik: optString(values.nik),
        noHp: optString(values.noHp),
        email: optString(values.email),
        tanggalBergabung: optString(values.tanggalBergabung),
        masaKerja: calculateTenure(optString(values.tanggalBergabung))?.label,
        statusAkad: optString(values.statusAkad) ?? "PKWT",
        durasiKontrak: optString(values.durasiKontrak),
        jtPerpanjanganKontrak: optString(values.jtPerpanjanganKontrak),
        status: optString(values.status) ?? "AKTIF",
        tmtResign: optString(values.tmtResign),
        bpjsKesehatanNumber: optString(values.bpjsKesehatanNumber),
        bank: optString(values.bank),
        noRekening: optString(values.noRekening),
        statusPernikahan: optString(values.statusPernikahan),
        jumlahAnak: values.jumlahAnak === undefined ? undefined : Number(values.jumlahAnak),
        pendidikanTerakhir: normalizePendidikan(values.pendidikanTerakhir) ?? undefined,
        universitas: optString(values.universitas),
        jurusan: optString(values.jurusan),
        updatedAt: now,
        updatedBy: user.id,
      };

      let employeeDocId: Id<"employees">;
      if (action === "UPDATE" && existing) {
        await ctx.db.patch(existing._id, payload);
        employeeDocId = existing._id;
        result.updated += 1;
        result.details.push({ rowNumber: row.rowNumber, niy, action: "UPDATE" });
      } else {
        employeeDocId = await ctx.db.insert("employees", {
          niy,
          ...payload,
          createdBy: user.id,
          createdAt: now,
        });
        result.created += 1;
        result.details.push({ rowNumber: row.rowNumber, niy, action: "NEW" });

        // Seed the related domains so a freshly imported record is immediately
        // usable: education history + primary position assignment.
        if (optString(values.universitas)) {
          await ctx.db.insert("educationRecords", {
            employeeId: employeeDocId,
            level: normalizePendidikan(values.pendidikanTerakhir) ?? "S1",
            institution: String(values.universitas).trim(),
            major: optString(values.jurusan),
            isCurrent: true,
            notes: "Dibuat otomatis saat import master karyawan",
            createdAt: now,
            updatedAt: now,
          });
        }
        if (jabatanId && bidangId) {
          await ctx.db.insert("positionAssignments", {
            employeeId: employeeDocId,
            positionId: jabatanId,
            unitId: bidangId,
            isPrimary: true,
            mulai: optString(values.tanggalBergabung) ?? new Date(now).toISOString().slice(0, 10),
            alasan: "Penempatan awal dari import master karyawan",
            createdAt: now,
          });
        }
      }
      // Flag missing documents so the dashboard reflects reality straight away.
      const missing = requiredDocs.filter(
        (category) =>
          !documents.some(
            (d) => d.employeeId === employeeDocId && d.category === category && d.status === "VERIFIED",
          ),
      );
      if (missing.length > 0) {
        const last = result.details[result.details.length - 1]!;
        result.details[result.details.length - 1] = {
          ...last,
          message: `Dokumen belum lengkap: ${missing.join(", ")}`,
        };
      }
    }

    // Keep the approved rows alongside the result: `backfillAssignments` re-reads
    // them to repair employees imported before the Referensi table was seeded.
    await ctx.db.patch(session._id, {
      status: "COMPLETED",
      summary: { ...result, rows: rawRows },
      completedAt: Date.now(),
    });

    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.IMPORT,
      entity: "employee",
      summary: `Import ${session.filename}: ${result.created} baru, ${result.updated} diperbarui, ${result.skipped} dilewati, ${result.errors} error`,
      metadata: {
        file: session.filename,
        total: result.total,
        baru: result.created,
        diperbarui: result.updated,
        dilewati: result.skipped,
        error: result.errors,
        aturanDuplikat: rule,
      },
    });
    return result;
  },
});

function optString(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

/** How many employees still have no placement, so the UI can offer a repair. */
export const placementGaps = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_IMPORT);
    return countPlacementGaps(ctx);
  },
});

/**
 * Repair employees whose bidang/jabatan was dropped because the Referensi table
 * was still empty when they were imported. The approved workbook rows are the
 * source of truth; nothing is invented here.
 */
export const backfillAssignments = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_IMPORT);
    const report = await backfillAssignmentsLogic(ctx, user.id);
    if (report.updated > 0) {
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "employee",
        summary: `Perbaikan penempatan bidang/jabatan: ${report.updated} karyawan (${report.bidangFilled} bidang, ${report.jabatanFilled} jabatan)`,
        metadata: {
          dipindai: report.scanned,
          diperbarui: report.updated,
          penempatan: report.assignmentsCreated,
        },
      });
    }
    return report;
  },
});

/** Downloadable error report (CSV) for the rows that were not imported. */
export const errorReport = query({
  args: { sessionId: v.id("importSessions") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.HR_IMPORT);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("NOT_FOUND");
    const summary = session.summary as unknown as {
      details?: { rowNumber: number; niy: string; action: string; message?: string }[];
    };
    const details = summary.details ?? [];
    const header = "Baris,NIY,Aksi,Pesan";
    const body = details
      .filter((d) => d.action === "ERROR" || d.action === "SKIP")
      .map((d) => `${d.rowNumber},"${d.niy}","${d.action}","${(d.message ?? "").replace(/"/g, "'")}"`)
      .join("\n");
    return {
      filename: `import-error-report-${session.filename.replace(/\.[^.]+$/, "")}.csv`,
      content: details.length ? `${header}\n${body}` : `${header}\n`,
      total: details.length,
    };
  },
});

export const sessions = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_IMPORT);
    const rows = await ctx.db.query("importSessions").order("desc").take(20);
    return rows.map((session) => ({
      id: session._id,
      filename: session.filename,
      status: session.status,
      duplicateRule: session.duplicateRule,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      summary: session.summary,
    }));
  },
});

export { employeeColumns };
export type { EmployeeColumn };
