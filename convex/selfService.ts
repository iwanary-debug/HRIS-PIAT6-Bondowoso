/**
 * Employee self-service portal (backend).
 *
 * Everything here is strictly scoped to the signed-in user's own employee
 * record: `requireSelf` / `optionalSelf` resolve the account to its linked
 * employee and every
 * query filters on that single id. No other employee's data is reachable from
 * this module, which is what makes it safe to give to every staff member.
 */

import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import {
  LEAVE_REQUEST_STATUS,
  LEAVE_TYPE,
  calculateLeaveDays,
  type LeaveType,
} from "../src/domain/leave";
import { requirePermission, type AuthenticatedUser } from "./lib/auth";
import { internal } from "./_generated/api";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, positionName, unitName } from "./lib/names";

type SelfCtx = QueryCtx | MutationCtx;

/** Resolve the caller's own employee record, or explain what is missing. */
async function requireSelf(ctx: SelfCtx): Promise<{
  user: AuthenticatedUser;
  employee: Doc<"employees">;
}> {
  const user = await requirePermission(ctx, PERMISSIONS.HR_SELF_VIEW);
  if (!user.employeeId) {
    throw new Error("AKUN_BELUM_TERTAUT");
  }
  const employee = await ctx.db.get(user.employeeId);
  if (!employee) throw new Error("DATA_KARYAWAN_TIDAK_DITEMUKAN");
  return { user, employee };
}

/**
 * Same permission check, but an account without a linked employee record is a
 * normal state (an HR admin who has not been entered in the master data yet),
 * not an exception. Queries answer with a renderable shape instead of throwing
 * across the wire, so the portal can show the right guidance instead of an
 * error page.
 */
async function optionalSelf(ctx: SelfCtx): Promise<{
  user: AuthenticatedUser;
  employee: Doc<"employees"> | null;
}> {
  const user = await requirePermission(ctx, PERMISSIONS.HR_SELF_VIEW);
  if (!user.employeeId) return { user, employee: null };
  return { user, employee: await ctx.db.get(user.employeeId) };
}

function nextNomor(existing: string[]): string {
  const year = new Date().getFullYear();
  const sameYear = existing.filter((n) => n.includes(`/${year}`));
  return `CUTI/${year}/${String(sameYear.length + 1).padStart(4, "0")}`;
}

/** Payslip rows stored as `v.any()`; expose only the printable line items. */
function payrollLines(computation: unknown): {
  code: string;
  name: string;
  kind: string;
  amount: number;
}[] {
  const lines = (computation as { lines?: unknown })?.lines;
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((line): line is { code: string; name: string; kind: string; amount: number } => {
      const candidate = line as { code?: unknown; name?: unknown; amount?: unknown };
      return typeof candidate.code === "string" && typeof candidate.amount === "number";
    })
    .map((line) => ({
      code: line.code,
      name: line.name,
      kind: line.kind,
      amount: line.amount,
    }));
}

/** Identity, job, contract status and the counters shown on the portal home. */
export const overview = query({
  args: { period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user, employee } = await optionalSelf(ctx);
    const period = args.period ?? new Date().toISOString().slice(0, 7);
    if (!employee) {
      return {
        status: "UNLINKED" as const,
        account: { name: user.name, email: user.email, role: user.role },
      };
    }
    const maps = await loadNameMaps(ctx);

    const contracts = await ctx.db
      .query("contracts")
      .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
      .collect();
    const activeContract = contracts
      .filter((c) => c.status === "AKTIF")
      .sort((a, b) => b.mulai.localeCompare(a.mulai))[0];

    const attendance = (
      await ctx.db
        .query("attendanceRecords")
        .withIndex("employeeId_date", (q) => q.eq("employeeId", employee._id))
        .collect()
    ).filter((r) => r.date.startsWith(period));
    const leave = await ctx.db
      .query("leaveRequests")
      .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
      .collect();
    const payslips = await ctx.db
      .query("payslips")
      .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
      .collect();
    const balances = await ctx.db
      .query("leaveBalances")
      .withIndex("employeeId_year", (q) =>
        q.eq("employeeId", employee._id).eq("year", new Date().getFullYear()),
      )
      .collect();

    const periodLabels = new Map(
      (await ctx.db.query("payrollPeriods").collect()).map((p) => [p._id, p.period]),
    );
    const latestSlip = payslips.length
      ? payslips
          .map((s) => ({
            period: periodLabels.get(s.periodId) ?? "—",
            netPay: s.netPay,
          }))
          .sort((a, b) => b.period.localeCompare(a.period))[0]
      : null;

    return {
      status: "OK" as const,
      account: { name: user.name, email: user.email, role: user.role },
      profile: {
        namaLengkap: employee.namaLengkap,
        niy: employee.niy,
        bidang: unitName(maps, employee.bidangId),
        jabatan: positionName(maps, employee.jabatanId),
        status: employee.status,
        statusAkad: employee.statusAkad,
        tanggalBergabung: employee.tanggalBergabung,
        masaKerja: employee.masaKerja,
        noHp: employee.noHp,
        email: employee.email,
        alamatKtp: employee.alamatKtp,
        nik: employee.nik,
      },
      contract: activeContract
        ? {
            nomor: activeContract.nomor,
            type: activeContract.type,
            mulai: activeContract.mulai,
            selesai: activeContract.selesai,
            status: activeContract.status,
          }
        : null,
      counters: {
        hadir: attendance.filter((a) => a.status === "HADIR").length,
        alpa: attendance.filter((a) => a.status === "ALFA").length,
        terlambat: attendance.filter((a) => (a.lateMinutes ?? 0) > 0).length,
        lembur: attendance.reduce((sum, a) => sum + (a.overtimeMinutes ?? 0), 0),
        cutiPending: leave.filter((l) => l.status === LEAVE_REQUEST_STATUS.PENDING).length,
        slipTerakhir: latestSlip,
      },
      balances: balances.map((b) => ({
        type: b.type,
        entitled: b.entitled,
        used: b.used,
        remaining: Math.max(0, b.entitled - b.used),
      })),
    };
  },
});

/** The employee's own attendance for one month (YYYY-MM). */
export const attendance = query({
  args: { period: v.string() },
  handler: async (ctx, args) => {
    const { employee } = await optionalSelf(ctx);
    if (!employee) return [];
    const records = (
      await ctx.db
        .query("attendanceRecords")
        .withIndex("employeeId_date", (q) => q.eq("employeeId", employee._id))
        .collect()
    ).filter((r) => r.date.startsWith(args.period));
    return records
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((r) => ({
        id: r._id,
        date: r.date,
        status: r.status,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        lateMinutes: r.lateMinutes,
        overtimeMinutes: r.overtimeMinutes,
        notes: r.notes,
      }));
  },
});

/** The employee's own leave requests plus the current-year balances. */
export const leave = query({
  args: {},
  handler: async (ctx) => {
    const { employee } = await optionalSelf(ctx);
    if (!employee) return { requests: [], balances: [] };
    const requests = await ctx.db
      .query("leaveRequests")
      .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
      .collect();
    const deciders = new Map(
      (await ctx.db.query("users").collect()).map((u) => [u._id, u.name]),
    );
    const balances = await ctx.db
      .query("leaveBalances")
      .withIndex("employeeId_year", (q) =>
        q.eq("employeeId", employee._id).eq("year", new Date().getFullYear()),
      )
      .collect();
    return {
      requests: requests
        .sort((a, b) => b.requestedAt - a.requestedAt)
        .map((r) => ({
          id: r._id,
          nomor: r.nomor,
          type: r.type,
          startDate: r.startDate,
          endDate: r.endDate,
          totalDays: r.totalDays,
          reason: r.reason,
          status: r.status,
          requestedAt: r.requestedAt,
          decidedAt: r.decidedAt,
          decidedByName: r.decidedBy ? (deciders.get(r.decidedBy) ?? "—") : undefined,
          decisionNote: r.decisionNote,
        })),
      balances: balances.map((b) => ({
        type: b.type,
        entitled: b.entitled,
        used: b.used,
        remaining: Math.max(0, b.entitled - b.used),
      })),
    };
  },
});

/** The employee's own payslips, newest period first. */
export const payslips = query({
  args: {},
  handler: async (ctx) => {
    const { employee } = await optionalSelf(ctx);
    if (!employee) return [];
    const slips = await ctx.db
      .query("payslips")
      .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
      .collect();
    const periods = new Map(
      (await ctx.db.query("payrollPeriods").collect()).map((p) => [p._id, p.period]),
    );
    return slips
      .map((s) => ({
        id: s._id,
        period: periods.get(s.periodId) ?? "—",
        periodId: s.periodId,
        baseSalary: s.baseSalary,
        totalEarnings: s.totalEarnings,
        totalDeductions: s.totalDeductions,
        netPay: s.netPay,
        status: s.status,
        lines: payrollLines(s.computation),
      }))
      .sort((a, b) => b.period.localeCompare(a.period));
  },
});

/** The employee's own document metadata (no file URLs — those stay with HR). */
export const documents = query({
  args: {},
  handler: async (ctx) => {
    const { employee } = await optionalSelf(ctx);
    if (!employee) return [];
    const docs = await ctx.db
      .query("documents")
      .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
      .collect();
    return docs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d) => ({
        id: d._id,
        category: d.category,
        name: d.name,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        status: d.status,
        issuedDate: d.issuedDate,
        expiryDate: d.expiryDate,
      }));
  },
});

/** File a leave request for the signed-in employee's own record. */
export const requestLeave = mutation({
  args: {
    type: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, employee } = await requireSelf(ctx);
    if (!Object.values(LEAVE_TYPE).includes(args.type as LeaveType)) {
      throw new Error("JENIS_CUTI_INVALID");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.endDate)) {
      throw new Error("Tanggal tidak valid");
    }
    if (args.endDate < args.startDate) {
      throw new Error("Tanggal akhir tidak boleh sebelum tanggal awal");
    }
    if (args.reason.trim().length < 5) {
      throw new Error("Alasan wajib diisi minimal 5 karakter");
    }
    if (employee.status !== "AKTIF") {
      throw new Error("Karyawan tidak aktif tidak dapat mengajukan cuti");
    }

    const existing = await ctx.db
      .query("leaveRequests")
      .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
      .collect();
    const clash = existing.find(
      (r) =>
        (r.status === LEAVE_REQUEST_STATUS.PENDING ||
          r.status === LEAVE_REQUEST_STATUS.APPROVED) &&
        r.startDate <= args.endDate &&
        r.endDate >= args.startDate,
    );
    if (clash) throw new Error(`Beririsan dengan pengajuan ${clash.nomor}`);

    const now = Date.now();
    const id = await ctx.db.insert("leaveRequests", {
      employeeId: employee._id,
      nomor: nextNomor(existing.map((r) => r.nomor)),
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      totalDays: calculateLeaveDays(args.startDate, args.endDate),
      reason: args.reason.trim(),
      status: LEAVE_REQUEST_STATUS.PENDING,
      requestedBy: user.id,
      requestedAt: now,
      createdAt: now,
    });
    await ctx.db.insert("leaveHistory", {
      leaveRequestId: id,
      toStatus: LEAVE_REQUEST_STATUS.PENDING,
      actorId: user.id,
      note: "Pengajuan dibuat oleh karyawan",
      createdAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "leaveRequest",
      recordId: id,
      summary: `${employee.namaLengkap} mengajukan cuti ${args.type} ${args.startDate}–${args.endDate}`,
    });
    // Email atasan bersifat best-effort dan tidak boleh menggagalkan pengajuan.
    ctx.scheduler.runAfter(0, internal.mail.notifyLeaveSubmitted, { leaveRequestId: id });
    return { id };
  },
});
