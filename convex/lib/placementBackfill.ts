/**
 * Placement repair for employees imported before the Referensi table was seeded.
 *
 * The workbook rows approved in an import session are the source of truth; this
 * module only re-resolves them into unit/position ids. It never invents data,
 * and it always writes through `ensureUnit`/`ensurePosition` so a name that the
 * Referensi table does not know yet is registered instead of dropped again.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ensurePosition, ensureUnit } from "./names";

interface PlacementRow {
  niy?: string;
  values?: Record<string, string | number | undefined>;
}

function text(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Approved bidang/jabatan per NIY across recent import sessions.
 * Sessions are read newest-first so the latest approved file wins.
 */
export async function placementSource(
  ctx: QueryCtx,
): Promise<Map<string, { bidang?: string; jabatan?: string }>> {
  const sessions = await ctx.db.query("importSessions").order("desc").take(20);
  const byNiy = new Map<string, { bidang?: string; jabatan?: string }>();
  for (const session of sessions) {
    const rows = (session.summary as unknown as { rows?: PlacementRow[] })?.rows ?? [];
    for (const row of rows) {
      const niy = text(row.niy);
      if (!niy || byNiy.has(niy)) continue;
      byNiy.set(niy, { bidang: text(row.values?.bidang), jabatan: text(row.values?.jabatan) });
    }
  }
  return byNiy;
}

export interface PlacementReport {
  scanned: number;
  updated: number;
  bidangFilled: number;
  jabatanFilled: number;
  assignmentsCreated: number;
  untraceable: number;
  details: {
    niy: string;
    namaLengkap: string;
    bidang?: string;
    jabatan?: string;
    message: string;
  }[];
}

export async function countPlacementGaps(ctx: QueryCtx) {
  const employees = await ctx.db.query("employees").collect();
  const source = await placementSource(ctx);
  const missing = employees.filter((e) => !e.bidangId || !e.jabatanId);
  return {
    total: employees.length,
    withoutBidang: employees.filter((e) => !e.bidangId).length,
    withoutJabatan: employees.filter((e) => !e.jabatanId).length,
    recoverable: missing.filter((e) => {
      const fromFile = source.get(e.niy);
      return Boolean(fromFile?.bidang || fromFile?.jabatan);
    }).length,
  };
}

export async function backfillAssignments(
  ctx: MutationCtx,
  actor: Id<"users">,
): Promise<PlacementReport> {
  const source = await placementSource(ctx);
  const employees = await ctx.db.query("employees").collect();
  const now = Date.now();

  const report: PlacementReport = {
    scanned: employees.length,
    updated: 0,
    bidangFilled: 0,
    jabatanFilled: 0,
    assignmentsCreated: 0,
    untraceable: 0,
    details: [],
  };

  for (const employee of employees) {
    if (employee.bidangId && employee.jabatanId) continue;
    const fromFile = source.get(employee.niy);
    if (!fromFile?.bidang && !fromFile?.jabatan) {
      report.untraceable += 1;
      continue;
    }
    const bidangId = fromFile.bidang ? await ensureUnit(ctx, fromFile.bidang) : null;
    const jabatanId = fromFile.jabatan
      ? await ensurePosition(ctx, fromFile.jabatan, bidangId ?? employee.bidangId)
      : null;
    const nextBidang = bidangId ?? employee.bidangId;
    const nextJabatan = jabatanId ?? employee.jabatanId;
    if (!nextBidang && !nextJabatan) continue;

    await ctx.db.patch(employee._id, {
      bidangId: nextBidang,
      jabatanId: nextJabatan,
      updatedAt: now,
      updatedBy: actor,
    });
    if (nextBidang && !employee.bidangId) report.bidangFilled += 1;
    if (nextJabatan && !employee.jabatanId) report.jabatanFilled += 1;
    report.updated += 1;
    report.details.push({
      niy: employee.niy,
      namaLengkap: employee.namaLengkap,
      bidang: fromFile.bidang,
      jabatan: fromFile.jabatan,
      message: nextBidang && nextJabatan ? "Penempatan diisi dari master data" : "Dilengkapi sebagian",
    });

    if (!nextBidang || !nextJabatan) continue;
    const assignments = await ctx.db
      .query("positionAssignments")
      .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
      .collect();
    if (assignments.some((a) => a.isPrimary && !a.selesai)) continue;
    await ctx.db.insert("positionAssignments", {
      employeeId: employee._id,
      positionId: nextJabatan,
      unitId: nextBidang,
      isPrimary: true,
      mulai: employee.tanggalBergabung ?? new Date(now).toISOString().slice(0, 10),
      alasan: "Penempatan awal dari master data karyawan",
      createdAt: now,
    });
    report.assignmentsCreated += 1;
  }

  return report;
}