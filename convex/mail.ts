/**
 * Email delivery for the leave and payroll workflows.
 *
 * Convex actions cannot read the database, so every action here first pulls
 * what it needs through an `internalQuery` and then calls the mailer. All
 * functions are `internal*`, so the browser can never trigger a send directly —
 * only the mutations that schedule them can.
 *
 * Delivery is best-effort: a missing API key or a provider outage is logged
 * and swallowed, so a leave request is never rejected because of an email.
 */

import { action, internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requirePermission } from "./lib/auth";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, type Role } from "../src/domain/permissions";
import { LEAVE_TYPE_LABELS, type LeaveType } from "../src/domain/leave";
import {
  sendLeaveDecisionEmail,
  sendLeaveSubmittedEmail,
  sendPayslipEmail,
  type MailResult,
} from "./lib/mailer";

function canApprove(role: string): boolean {
  return (ROLE_PERMISSIONS[role as Role] ?? []).includes(PERMISSIONS.HR_LEAVE_APPROVE);
}

/** Everything the leave emails need, resolved from one place. */
export const leaveMailData = internalQuery({
  args: { leaveRequestId: v.id("leaveRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.leaveRequestId);
    if (!request) return null;
    const employee = await ctx.db.get(request.employeeId);
    const requester = await ctx.db.get(request.requestedBy);
    const decider = request.decidedBy ? await ctx.db.get(request.decidedBy) : null;
    return {
      employeeName: employee?.namaLengkap ?? "—",
      employeeNiy: employee?.niy ?? "—",
      leaveType: LEAVE_TYPE_LABELS[request.type as LeaveType] ?? request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: request.totalDays,
      reason: request.reason,
      nomor: request.nomor,
      status: request.status,
      decisionNote: request.decisionNote,
      requesterEmail: requester?.email ?? "",
      deciderName: decider?.name,
      employeeUnitId: employee?.bidangId ?? null,
    };
  },
});

/** Active approvers who should be told about a new request. */
export const approverRecipients = internalQuery({
  args: { employeeUnitId: v.union(v.id("organizationUnits"), v.null()) },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (user) =>
          user.active &&
          canApprove(user.role) &&
          // Unit managers only handle their own unit; HRD and Super Admin see all.
          (user.role !== ROLES.UNIT_MANAGER ||
            !user.unitId ||
            user.unitId === args.employeeUnitId),
      )
      .map((user) => ({ name: user.name, email: user.email }));
  },
});

/** Payslip recipient lookup, matched by the employee's own email. */
export const payslipMailData = internalQuery({
  args: { payslipId: v.id("payslips") },
  handler: async (ctx, args) => {
    const slip = await ctx.db.get(args.payslipId);
    if (!slip) return null;
    const employee = await ctx.db.get(slip.employeeId);
    if (!employee) return null;
    const period = await ctx.db.get(slip.periodId);
    const user = employee.email
      ? await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", employee.email!))
          .unique()
      : null;
    return {
      to: user?.email ?? employee.email ?? "",
      employeeName: employee.namaLengkap,
      period: period?.period ?? "—",
      netPay: slip.netPay,
      totalEarnings: slip.totalEarnings,
      totalDeductions: slip.totalDeductions,
    };
  },
});

export const notifyLeaveSubmitted = internalAction({
  args: { leaveRequestId: v.id("leaveRequests") },
  handler: async (ctx, args): Promise<{ recipients: number; results: MailResult[] }> => {
    const data = await ctx.runQuery(internal.mail.leaveMailData, {
      leaveRequestId: args.leaveRequestId,
    });
    if (!data) return { recipients: 0, results: [] };

    const approvers = await ctx.runQuery(internal.mail.approverRecipients, {
      employeeUnitId: data.employeeUnitId,
    });
    const results: MailResult[] = [];
    for (const approver of approvers) {
      results.push(await sendLeaveSubmittedEmail({ to: approver.email, ...data }));
    }
    console.log(`notifyLeaveSubmitted ${data.nomor}: ${approvers.length} penerima`, results);
    return { recipients: approvers.length, results };
  },
});

export const notifyLeaveDecided = internalAction({
  args: { leaveRequestId: v.id("leaveRequests") },
  handler: async (ctx, args): Promise<MailResult> => {
    const data = await ctx.runQuery(internal.mail.leaveMailData, {
      leaveRequestId: args.leaveRequestId,
    });
    if (!data) return { status: "skipped", detail: "pengajuan tidak ditemukan" };
    if (!data.requesterEmail) return { status: "skipped", detail: "email pemohon kosong" };

    const result = await sendLeaveDecisionEmail({
      to: data.requesterEmail,
      employeeName: data.employeeName,
      employeeNiy: data.employeeNiy,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      totalDays: data.totalDays,
      reason: data.reason,
      nomor: data.nomor,
      status: data.status,
      decidedBy: data.deciderName,
      decisionNote: data.decisionNote,
    });
    console.log(`notifyLeaveDecided ${data.nomor}:`, result);
    return result;
  },
});

export const notifyPayslipReady = internalAction({  args: { payslipId: v.id("payslips") },
  handler: async (ctx, args): Promise<MailResult> => {
    const data = await ctx.runQuery(internal.mail.payslipMailData, { payslipId: args.payslipId });
    if (!data) return { status: "skipped", detail: "slip gaji tidak ditemukan" };
    if (!data.to) return { status: "skipped", detail: "tidak ada email Slip gaji" };

    const result = await sendPayslipEmail(data);
    console.log(`notifyPayslipReady ${data.period}:`, result);
    return result;
  },
});

/**
 * Recipients for one payroll period, permission-checked in the query because
 * only a query can call `requirePermission` on the caller's identity.
 */
export const payslipRecipients = internalQuery({
  args: { periodId: v.id("payrollPeriods") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.HR_PAYROLL_EDIT);
    const slips = await ctx.db
      .query("payslips")
      .withIndex("periodId", (q) => q.eq("periodId", args.periodId))
      .collect();
    const employees = await ctx.db.query("employees").collect();
    const byId = new Map(employees.map((e) => [e._id, e]));
    const users = await ctx.db.query("users").collect();
    const byEmail = new Map(users.map((u) => [u.email, u.email]));

    return slips
      .map((slip) => {
        const employee = byId.get(slip.employeeId);
        const email = employee?.email ? (byEmail.get(employee.email) ?? null) : null;
        return {
          payslipId: slip._id,
          to: email ?? "",
          employeeName: employee?.namaLengkap ?? "—",
          netPay: slip.netPay,
          totalEarnings: slip.totalEarnings,
          totalDeductions: slip.totalDeductions,
        };
      })
      .filter((row) => row.to !== "");
  },
});

/**
 * Email every payslip of a period. Public so HR can trigger it from the
 * payroll screen, but the permission check still happens server-side in
 * `payslipRecipients`.
 */
export const sendPayslipsForPeriod = action({
  args: { periodId: v.id("payrollPeriods") },
  handler: async (ctx, args): Promise<{ sent: number; skipped: number; failed: number; period: string }> => {
    const recipients = await ctx.runQuery(internal.mail.payslipRecipients, {
      periodId: args.periodId,
    });
    const period = await ctx.runQuery(internal.mail.payslipPeriodLabel, { periodId: args.periodId });

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const result = await sendPayslipEmail({ ...recipient, period });
      if (result.status === "sent") sent += 1;
      else if (result.status === "skipped") skipped += 1;
      else failed += 1;
    }
    console.log(`sendPayslipsForPeriod ${period}:`, { sent, skipped, failed, total: recipients.length });
    return { sent, skipped, failed, period };
  },
});

export const payslipPeriodLabel = internalQuery({
  args: { periodId: v.id("payrollPeriods") },
  handler: async (ctx, args) => (await ctx.db.get(args.periodId))?.period ?? "—",
});
