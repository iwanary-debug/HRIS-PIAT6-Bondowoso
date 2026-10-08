/**
 * BPJS & Benefit module.
 * Membership numbers are sensitive: they are only returned to callers with
 * HR_SENSITIVE_VIEW, otherwise they are masked server-side.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import { BENEFIT_TYPE, type BenefitType } from "../src/domain/lifecycle";
import { maskSensitive } from "../src/domain/lifecycle";
import { hasPermission, requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, positionName, unitName } from "./lib/names";

export const list = query({
  args: {
    employeeId: v.optional(v.id("employees")),
    bidangId: v.optional(v.id("organizationUnits")),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const includeSensitive = hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW);
    const benefits = await ctx.db.query("benefits").collect();
    const employees = await ctx.db.query("employees").collect();
    const byId = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);

    return benefits
      .filter((b) => (args.employeeId ? b.employeeId === args.employeeId : true))
      .filter((b) => (args.type ? b.type === args.type : true))
      .filter((b) => (args.status ? b.status === args.status : true))
      .filter((b) =>
        args.bidangId ? byId.get(b.employeeId)?.bidangId === args.bidangId : true,
      )
      .map((benefit) => {
        const employee = byId.get(benefit.employeeId);
        return {
          id: benefit._id,
          employeeId: benefit.employeeId,
          namaLengkap: employee?.namaLengkap ?? "—",
          niy: employee?.niy ?? "—",
          bidang: unitName(maps, employee?.bidangId),
          jabatan: positionName(maps, employee?.jabatanId),
          type: benefit.type,
          provider: benefit.provider,
          number: includeSensitive ? benefit.number : maskSensitive(benefit.number),
          masked: !includeSensitive,
          status: benefit.status,
          startDate: benefit.startDate,
          endDate: benefit.endDate,
          monthlyContribution: benefit.monthlyContribution,
          notes: benefit.notes,
        };
      })
      .sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap, "id"));
  },
});

export const summary = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const [benefits, employees] = await Promise.all([
      ctx.db.query("benefits").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const active = employees.filter((e) => e.status === "AKTIF");
    const activeIds = new Set(active.map((e) => e._id));
    const byType = new Map<string, number>();
    let totalContribution = 0;
    for (const benefit of benefits) {
      if (benefit.status !== "ACTIVE" || !activeIds.has(benefit.employeeId)) continue;
      byType.set(benefit.type, (byType.get(benefit.type) ?? 0) + 1);
      totalContribution += benefit.monthlyContribution ?? 0;
    }
    const covered = new Set(
      benefits
        .filter((b) => b.status === "ACTIVE" && b.type === "BPJS_KESEHATAN")
        .map((b) => b.employeeId),
    );
    return {
      totalActive: active.length,
      bpjsKesehatan: byType.get("BPJS_KESEHATAN") ?? 0,
      bpjsKetenagakerjaan: byType.get("BPJS_KETENAGAKERJAAN") ?? 0,
      tunjangan: byType.get("TUNJANGAN") ?? 0,
      lainnya: byType.get("LAINNYA") ?? 0,
      belumTerdaftar: active.length - covered.size,
      totalMonthlyContribution: totalContribution,
    };
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("benefits")),
    employeeId: v.id("employees"),
    type: v.string(),
    provider: v.optional(v.string()),
    number: v.optional(v.union(v.string(), v.null())),
    status: v.optional(v.string()),
    startDate: v.optional(v.union(v.string(), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
    monthlyContribution: v.optional(v.union(v.number(), v.null())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    if (!Object.values(BENEFIT_TYPE).includes(args.type as BenefitType)) {
      throw new Error("JENIS_BENEFIT_INVALID");
    }
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    if (args.monthlyContribution !== undefined && args.monthlyContribution !== null && args.monthlyContribution < 0) {
      throw new Error("Kontribusi tidak boleh negatif");
    }
    const now = Date.now();
    const payload = {
      employeeId: args.employeeId,
      type: args.type,
      provider: args.provider ?? undefined,
      number: args.number ?? undefined,
      status: args.status ?? "ACTIVE",
      startDate: args.startDate ?? undefined,
      endDate: args.endDate ?? undefined,
      monthlyContribution: args.monthlyContribution ?? undefined,
      notes: args.notes ?? undefined,
      updatedAt: now,
    };
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "benefit",
        recordId: args.id,
        summary: `Benefit ${args.type} ${employee.namaLengkap} diperbarui`,
        fields: ["type", "provider", "status", "startDate", "endDate", "monthlyContribution"],
      });
      return { id: args.id };
    }
    const id = await ctx.db.insert("benefits", { ...payload, createdAt: now });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "benefit",
      recordId: id,
      summary: `Benefit ${args.type} ditambahkan untuk ${employee.namaLengkap}`,
    });
    return { id };
  },
});
