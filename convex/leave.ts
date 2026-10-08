/**
 * Leave & permission workflow.
 * Every status change goes through `transition`, which enforces the state
 * machine, the approver permission, the leave balance and the audit trail.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS, ROLES } from "../src/domain/permissions";
import {
  LEAVE_REQUEST_STATUS,
  LEAVE_TYPE,
  calculateLeaveDays,
  canTransition,
  leaveDateRange,
  type LeaveRequestStatus,
  type LeaveType,
} from "../src/domain/leave";
import { requireUser, requirePermission, hasPermission } from "./lib/auth";
import { internal } from "./_generated/api";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, positionName, unitName } from "./lib/names";

function nextNomor(existing: string[]): string {
  const year = new Date().getFullYear();
  const sameYear = existing.filter((n) => n.includes(`/${year}`));
  return `CUTI/${year}/${String(sameYear.length + 1).padStart(4, "0")}`;
}

export const list = query({
  args: {
    status: v.optional(v.string()),
    employeeId: v.optional(v.id("employees")),
    bidangId: v.optional(v.id("organizationUnits")),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    let rows = await ctx.db.query("leaveRequests").collect();
    const employees = await ctx.db.query("employees").collect();
    const employeeById = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);

    if (user.role === "EMPLOYEE_SELF_SERVICE") {
      rows = rows.filter((r) => r.employeeId === user.employeeId);
    } else if (user.role === "UNIT_MANAGER" && user.unitId) {
      rows = rows.filter((r) => employeeById.get(r.employeeId)?.bidangId === user.unitId);
    }
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    if (args.type) rows = rows.filter((r) => r.type === args.type);
    if (args.employeeId) rows = rows.filter((r) => r.employeeId === args.employeeId);
    if (args.bidangId) {
      rows = rows.filter((r) => employeeById.get(r.employeeId)?.bidangId === args.bidangId);
    }

    const decidedBy = new Map(
      (await ctx.db.query("users").collect()).map((u) => [u._id, u.name]),
    );

    return rows
      .sort((a, b) => b.requestedAt - a.requestedAt)
      .map((request) => {
        const employee = employeeById.get(request.employeeId);
        return {
          id: request._id,
          nomor: request.nomor,
          employeeId: request.employeeId,
          namaLengkap: employee?.namaLengkap ?? "—",
          niy: employee?.niy ?? "—",
          bidang: unitName(maps, employee?.bidangId),
          jabatan: positionName(maps, employee?.jabatanId),
          type: request.type,
          startDate: request.startDate,
          endDate: request.endDate,
          totalDays: request.totalDays,
          reason: request.reason,
          attachmentDocumentId: request.attachmentDocumentId,
          status: request.status,
          requestedAt: request.requestedAt,
          requestedByName: decidedBy.get(request.requestedBy) ?? "—",
          decidedAt: request.decidedAt,
          decidedByName: request.decidedBy ? (decidedBy.get(request.decidedBy) ?? "—") : undefined,
          decisionNote: request.decisionNote,
        };
      });
  },
});

export const get = query({
  args: { id: v.id("leaveRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) return null;
    const employee = await ctx.db.get(request.employeeId);
    const history = await ctx.db
      .query("leaveHistory")
      .withIndex("leaveRequestId", (q) => q.eq("leaveRequestId", args.id))
      .collect();
    return {
      ...request,
      employee: employee
        ? { id: employee._id, namaLengkap: employee.namaLengkap, niy: employee.niy }
        : null,
      history: history.sort((a, b) => a.createdAt - b.createdAt),
      canApprove: hasPermission(user, PERMISSIONS.HR_LEAVE_APPROVE),
    };
  },
});

export const balances = query({
  args: { employeeId: v.optional(v.id("employees")), year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const year = args.year ?? new Date().getFullYear();
    if (!args.employeeId) return [];
    const balances = await ctx.db
      .query("leaveBalances")
      .withIndex("employeeId_year", (q) =>
        q.eq("employeeId", args.employeeId!).eq("year", year),
      )
      .collect();
    return balances.map((balance) => ({
      ...balance,
      remaining: Math.max(0, balance.entitled - balance.used),
    }));
  },
});

export const create = mutation({
  args: {
    employeeId: v.id("employees"),
    type: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    reason: v.string(),
    attachmentDocumentId: v.optional(v.union(v.id("documents"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_LEAVE_REQUEST);
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    if (user.role === ROLES.EMPLOYEE_SELF_SERVICE && user.employeeId !== args.employeeId) {
      throw new Error("FORBIDDEN:HR_LEAVE_REQUEST");
    }
    if (!Object.values(LEAVE_TYPE).includes(args.type as LeaveType)) {
      throw new Error("JENIS_CUTI_INVALID");
    }
    if (args.endDate < args.startDate) throw new Error("Tanggal akhir tidak boleh sebelum tanggal awal");
    if (args.reason.trim().length < 5) throw new Error("Alasan wajib diisi minimal 5 karakter");
    if (employee.status !== "AKTIF") throw new Error("Karyawan tidak aktif tidak dapat mengajukan cuti");

    // Overlap check against existing requests.
    const existing = await ctx.db
      .query("leaveRequests")
      .withIndex("employeeId", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    const clash = existing.find(
      (r) =>
        ["PENDING", "APPROVED"].includes(r.status) &&
        r.startDate <= args.endDate &&
        r.endDate >= args.startDate,
    );
    if (clash) throw new Error(`Beririsan dengan pengajuan ${clash.nomor}`);

    const now = Date.now();
    const id = await ctx.db.insert("leaveRequests", {
      employeeId: args.employeeId,
      nomor: nextNomor(existing.map((r) => r.nomor)),
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      totalDays: calculateLeaveDays(args.startDate, args.endDate),
      reason: args.reason.trim(),
      attachmentDocumentId: args.attachmentDocumentId ?? undefined,
      status: LEAVE_REQUEST_STATUS.PENDING,
      requestedBy: user.id,
      requestedAt: now,
      createdAt: now,
    });
    await ctx.db.insert("leaveHistory", {
      leaveRequestId: id,
      toStatus: LEAVE_REQUEST_STATUS.PENDING,
      actorId: user.id,
      note: "Pengajuan dibuat",
      createdAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "leaveRequest",
      recordId: id,
      summary: `Pengajuan cuti ${args.type} ${args.startDate}–${args.endDate} oleh ${employee.namaLengkap}`,
    });
    // Email is best-effort: a mail outage must never fail the request.
    ctx.scheduler.runAfter(0, internal.mail.notifyLeaveSubmitted, { leaveRequestId: id });
    return { id };
  },
});

/**
 * Approve / reject / cancel. Approving also writes the attendance records and
 * the leave balance so the dashboard reflects reality immediately.
 */
export const decide = mutation({
  args: {
    id: v.id("leaveRequests"),
    decision: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_LEAVE_APPROVE);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("NOT_FOUND");
    const target = args.decision as LeaveRequestStatus;
    if (!Object.values(LEAVE_REQUEST_STATUS).includes(target)) {
      throw new Error("KEPUTUSAN_INVALID");
    }
    if (!canTransition(request.status as LeaveRequestStatus, target)) {
      throw new Error(`Tidak dapat mengubah status ${request.status} menjadi ${target}`);
    }
    if (target === LEAVE_REQUEST_STATUS.REJECTED && !args.note?.trim()) {
      throw new Error("Alasan penolakan wajib diisi");
    }
    if (request.employeeId === user.employeeId && target !== LEAVE_REQUEST_STATUS.CANCELLED) {
      throw new Error("Anda tidak dapat menyetujui pengajuan cuti sendiri");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: target,
      decidedBy: user.id,
      decidedAt: now,
      decisionNote: args.note ?? undefined,
    });
    await ctx.db.insert("leaveHistory", {
      leaveRequestId: request._id,
      fromStatus: request.status,
      toStatus: target,
      actorId: user.id,
      note: args.note,
      createdAt: now,
    });

    if (target === LEAVE_REQUEST_STATUS.APPROVED) {
      // Reflect approved leave in attendance and consume the balance.
      const type = request.type === "SAKIT" ? "SAKIT" : "CUTI";
      for (const date of leaveDateRange(request.startDate, request.endDate)) {
        const existing = await ctx.db
          .query("attendanceRecords")
          .withIndex("employeeId_date", (q) =>
            q.eq("employeeId", request.employeeId).eq("date", date),
          )
          .unique();
        if (existing) continue;
        await ctx.db.insert("attendanceRecords", {
          employeeId: request.employeeId,
          date,
          status: type,
          source: "WEB",
          notes: `Otomatis dari pengajuan ${request.nomor}`,
          recordedBy: user.id,
          createdAt: now,
          updatedAt: now,
        });
      }

      const year = new Date(request.startDate).getFullYear();
      const balance = await ctx.db
        .query("leaveBalances")
        .withIndex("employeeId_year", (q) =>
          q.eq("employeeId", request.employeeId).eq("year", year),
        )
        .unique();
      if (balance && ["CUTI", "CUTI_BESAR"].includes(request.type)) {
        await ctx.db.patch(balance._id, { used: balance.used + request.totalDays });
      }
    }

    const employee = await ctx.db.get(request.employeeId);
    await writeAudit(ctx, user, {
      action: target === LEAVE_REQUEST_STATUS.APPROVED ? AUDIT_ACTION.APPROVE : AUDIT_ACTION.REJECT,
      entity: "leaveRequest",
      recordId: request._id,
      summary: `Pengajuan ${request.nomor} (${employee?.namaLengkap ?? "—"}) → ${target}`,
      metadata: { dari: request.status, ke: target, catatan: args.note ?? "-" },
    });
    // Tell the requester the outcome; failures are swallowed by the action.
    ctx.scheduler.runAfter(0, internal.mail.notifyLeaveDecided, { leaveRequestId: request._id });
    return { ok: true as const };
  },
});

export const setBalance = mutation({
  args: {
    employeeId: v.id("employees"),
    year: v.number(),
    type: v.string(),
    entitled: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_LEAVE_APPROVE);
    if (args.entitled < 0) throw new Error("Jatah tidak boleh negatif");
    const existing = await ctx.db
      .query("leaveBalances")
      .withIndex("employeeId_year", (q) =>
        q.eq("employeeId", args.employeeId).eq("year", args.year),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { entitled: args.entitled, notes: args.notes ?? existing.notes });
    } else {
      await ctx.db.insert("leaveBalances", {
        employeeId: args.employeeId,
        year: args.year,
        type: args.type,
        entitled: args.entitled,
        used: 0,
        notes: args.notes,
      });
    }
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "leaveBalance",
      summary: `Jatah cuti ${args.type} ${args.year} disetel menjadi ${args.entitled} hari`,
    });
    return { ok: true as const };
  },
});

/** Leave report per unit for a given period. */
export const report = query({
  args: { period: v.optional(v.string()), bidangId: v.optional(v.id("organizationUnits")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const period = args.period ?? new Date().toISOString().slice(0, 7);
    const [requests, employees] = await Promise.all([
      ctx.db.query("leaveRequests").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const employeeById = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);
    const scoped = requests.filter((r) => {
      if (!r.startDate.startsWith(period)) return false;
      if (args.bidangId && employeeById.get(r.employeeId)?.bidangId !== args.bidangId) return false;
      return true;
    });

    const byType = new Map<string, { count: number; days: number }>();
    for (const request of scoped) {
      const current = byType.get(request.type) ?? { count: 0, days: 0 };
      current.count += 1;
      current.days += request.totalDays;
      byType.set(request.type, current);
    }
    return {
      period,
      total: scoped.length,
      totalDays: scoped.reduce((sum, r) => sum + r.totalDays, 0),
      byType: [...byType.entries()].map(([type, value]) => ({ type, ...value })),
      rows: scoped.map((r) => ({
        nomor: r.nomor,
        namaLengkap: employeeById.get(r.employeeId)?.namaLengkap ?? "—",
        bidang: unitName(maps, employeeById.get(r.employeeId)?.bidangId),
        type: r.type,
        startDate: r.startDate,
        endDate: r.endDate,
        totalDays: r.totalDays,
        status: r.status,
      })),
    };
  },
});
