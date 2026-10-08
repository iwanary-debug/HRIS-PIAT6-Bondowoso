/**
 * Notification counters for the top bar and dashboard operations panel.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, hasPermission } from "./lib/auth";
import { PERMISSIONS } from "../src/domain/permissions";
import { evaluateContractStatus } from "../src/domain/contract";

export const pendingCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [leave, resignations, contracts, employees] = await Promise.all([
      ctx.db.query("leaveRequests").collect(),
      ctx.db.query("resignations").collect(),
      ctx.db.query("contracts").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const activeIds = new Set(
      employees.filter((e) => e.status === "AKTIF").map((e) => e._id),
    );
    return {
      leave: leave.filter((l) => l.status === "PENDING").length,
      resignations: resignations.filter((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED").length,
      contracts: contracts.filter(
        (c) => c.status === "AKTIF" && activeIds.has(c.employeeId) && evaluateContractStatus(c.selesai).status !== "AMAN",
      ).length,
      canApprove: hasPermission(user, PERMISSIONS.HR_LEAVE_APPROVE),
    };
  },
});

export const contractWatch = query({
  args: { bidangId: v.optional(v.id("organizationUnits")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [contracts, employees] = await Promise.all([
      ctx.db.query("contracts").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const byId = new Map(employees.map((e) => [e._id, e]));
    return contracts
      .filter((c) => c.status === "AKTIF" && (args.bidangId ? byId.get(c.employeeId)?.bidangId === args.bidangId : true))
      .map((c) => {
        const e = byId.get(c.employeeId);
        const evaluation = evaluateContractStatus(c.selesai);
        return {
          contractId: c._id,
          employeeId: c.employeeId,
          namaLengkap: e?.namaLengkap ?? "—",
          nomor: c.nomor,
          selesai: c.selesai,
          status: evaluation.status,
          daysRemaining: evaluation.daysRemaining,
        };
      })
      .filter((row) => row.status !== "AMAN")
      .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0));
  },
});
