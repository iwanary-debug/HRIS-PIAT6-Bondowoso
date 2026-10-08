/**
 * Payroll foundation.
 * Components are data, not code — no PIAT 6 payroll rule is hard-coded. The
 * engine (`src/domain/payroll.ts`) just evaluates the configured list.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import {
  COMPONENT_KIND,
  PAYROLL_PERIOD_STATUS,
  computePayroll,
  type ComponentKind,
  type PayrollComponentInput,
} from "../src/domain/payroll";
import { requirePermission, requireUser, hasPermission } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";

export const listComponents = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const components = await ctx.db.query("payrollComponents").collect();
    return components
      .filter((c) => args.includeInactive ?? c.active)
      .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
      .map((c) => ({
        id: c._id,
        code: c.code,
        name: c.name,
        kind: c.kind,
        calculation: c.calculation,
        value: c.value,
        basedOnCode: c.basedOnCode,
        taxable: c.taxable,
        active: c.active,
        description: c.description,
        order: c.order,
      }));
  },
});

export const saveComponent = mutation({
  args: {
    id: v.optional(v.id("payrollComponents")),
    code: v.string(),
    name: v.string(),
    kind: v.string(),
    calculation: v.string(),
    value: v.number(),
    basedOnCode: v.optional(v.union(v.string(), v.null())),
    taxable: v.boolean(),
    active: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_PAYROLL_EDIT);
    if (!/^[A-Z0-9_]{2,20}$/.test(args.code)) {
      throw new Error("Kode komponen harus huruf kapital/angka/underscore (2–20 karakter)");
    }
    if (!Object.values(COMPONENT_KIND).includes(args.kind as ComponentKind)) {
      throw new Error("JENIS_KOMPONEN_INVALID");
    }
    if (args.value < 0) throw new Error("Nilai komponen tidak boleh negatif");
    if (args.calculation === "PERCENTAGE_OF_COMPONENT" && !args.basedOnCode) {
      throw new Error("Komponen persentase harus menunjuk komponen dasar");
    }
    const duplicate = await ctx.db
      .query("payrollComponents")
      .withIndex("code", (q) => q.eq("code", args.code))
      .unique();
    if (duplicate && duplicate._id !== args.id) {
      throw new Error(`Kode komponen ${args.code} sudah digunakan`);
    }

    const now = Date.now();
    const payload = {
      code: args.code,
      name: args.name.trim(),
      kind: args.kind,
      calculation: args.calculation,
      value: args.value,
      basedOnCode: args.basedOnCode ?? undefined,
      taxable: args.taxable,
      active: args.active ?? true,
      description: args.description ?? undefined,
    };

    if (args.id) {
      await ctx.db.patch(args.id, { ...payload, updatedAt: now });
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "payrollComponent",
        recordId: args.id,
        summary: `Komponen payroll ${args.code} diperbarui`,
        fields: ["name", "kind", "calculation", "value", "taxable", "active"],
      });
      return { id: args.id };
    }
    const order = (await ctx.db.query("payrollComponents").collect()).length;
    const id = await ctx.db.insert("payrollComponents", {
      ...payload,
      order,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "payrollComponent",
      recordId: id,
      summary: `Komponen payroll ${args.code} dibuat`,
    });
    return { id };
  },
});

/** Preview a payslip for one employee without persisting anything. */
export const preview = query({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!hasPermission(user, PERMISSIONS.HR_PAYROLL_VIEW)) {
      throw new Error("FORBIDDEN:HR_PAYROLL_VIEW");
    }
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("NOT_FOUND");
    const [components, structures] = await Promise.all([
      ctx.db.query("payrollComponents").collect(),
      ctx.db.query("salaryStructures").collect(),
    ]);
    const active = components
      .filter((c) => c.active)
      .sort((a, b) => a.order - b.order) as PayrollComponentInput[];

    const structure = structures
      .filter((s) => s.employeeId === args.employeeId)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
    const computation = computePayroll(structure?.baseSalary ?? 0, active);
    return {
      employee: { id: employee._id, namaLengkap: employee.namaLengkap, niy: employee.niy },
      effectiveDate: structure?.effectiveDate ?? null,
      computation,
    };
  },
});

export const setSalary = mutation({
  args: {
    employeeId: v.id("employees"),
    baseSalary: v.number(),
    effectiveDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_PAYROLL_EDIT);
    if (args.baseSalary < 0) throw new Error("Gaji dasar tidak boleh negatif");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("NOT_FOUND");
    const now = Date.now();
    const effectiveDate = args.effectiveDate ?? nowToIso(now);

    await ctx.db.insert("salaryStructures", {
      employeeId: args.employeeId,
      baseSalary: args.baseSalary,
      effectiveDate,
      notes: args.notes,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "salaryStructure",
      summary: `Struktur gaji ${employee.namaLengkap} diperbarui (nilai disamarkan)`,
      metadata: { efektif: effectiveDate, note: "nilai gaji tidak dicatat di log" },
    });
    return { ok: true as const };
  },
});

const nowToIso = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export const listPeriods = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const periods = await ctx.db.query("payrollPeriods").collect();
    const payslips = await ctx.db.query("payslips").collect();
    return periods
      .map((period) => {
        const slips = payslips.filter((p) => p.periodId === period._id);
        return {
          id: period._id,
          period: period.period,
          startDate: period.startDate,
          endDate: period.endDate,
          status: period.status,
          description: period.description,
          jumlahSlip: slips.length,
          totalNet: slips.reduce((sum, s) => sum + s.netPay, 0),
        };
      })
      .sort((a, b) => b.period.localeCompare(a.period));
  },
});

export const createPeriod = mutation({
  args: {
    period: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_PAYROLL_EDIT);
    if (!/^\d{4}-\d{2}$/.test(args.period)) throw new Error("Periode harus format yyyy-mm");
    const existing = await ctx.db
      .query("payrollPeriods")
      .withIndex("period", (q) => q.eq("period", args.period))
      .unique();
    if (existing) throw new Error(`Periode ${args.period} sudah ada`);
    const now = Date.now();
    const id = await ctx.db.insert("payrollPeriods", {
      period: args.period,
      startDate: args.startDate,
      endDate: args.endDate,
      status: PAYROLL_PERIOD_STATUS.DRAFT,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "payrollPeriod",
      recordId: id,
      summary: `Periode payroll ${args.period} dibuat`,
    });
    return { id };
  },
});

/** Generate payslips for every active employee with a salary structure. */
export const generate = mutation({
  args: { periodId: v.id("payrollPeriods") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_PAYROLL_EDIT);
    const period = await ctx.db.get(args.periodId);
    if (!period) throw new Error("NOT_FOUND");
    if (period.status !== PAYROLL_PERIOD_STATUS.DRAFT) {
      throw new Error("Hanya periode berstatus Draf yang dapat dihitung");
    }
    const [components, structures, employees, existing] = await Promise.all([
      ctx.db.query("payrollComponents").collect(),
      ctx.db.query("salaryStructures").collect(),
      ctx.db.query("employees").collect(),
      ctx.db.query("payslips").collect(),
    ]);
    const active = components
      .filter((c) => c.active)
      .sort((a, b) => a.order - b.order) as PayrollComponentInput[];
    const activeIds = new Set(employees.filter((e) => e.status === "AKTIF").map((e) => e._id));
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const structure of structures) {
      if (!activeIds.has(structure.employeeId)) continue;
      if (existing.some((p) => p.periodId === args.periodId && p.employeeId === structure.employeeId)) {
        skipped += 1;
        continue;
      }
      const computation = computePayroll(structure.baseSalary, active);
      await ctx.db.insert("payslips", {
        periodId: args.periodId,
        employeeId: structure.employeeId,
        baseSalary: structure.baseSalary,
        computation,
        totalEarnings: computation.totalEarnings,
        totalDeductions: computation.totalDeductions,
        netPay: computation.netPay,
        status: PAYROLL_PERIOD_STATUS.DRAFT,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }

    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "payrollPeriod",
      recordId: args.periodId,
      summary: `Slip gaji ${period.period} dihitung: ${created} dibuat, ${skipped} dilewati`,
    });
    return { created, skipped };
  },
});

export const listPayslips = query({
  args: { periodId: v.id("payrollPeriods") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!hasPermission(user, PERMISSIONS.HR_PAYROLL_VIEW)) {
      throw new Error("FORBIDDEN:HR_PAYROLL_VIEW");
    }
    const [slips, employees] = await Promise.all([
      ctx.db.query("payslips").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const byId = new Map(employees.map((e) => [e._id, e]));
    return slips
      .filter((s) => s.periodId === args.periodId)
      .map((s) => ({
        id: s._id,
        employeeId: s.employeeId,
        namaLengkap: byId.get(s.employeeId)?.namaLengkap ?? "—",
        niy: byId.get(s.employeeId)?.niy ?? "—",
        baseSalary: s.baseSalary,
        totalEarnings: s.totalEarnings,
        totalDeductions: s.totalDeductions,
        netPay: s.netPay,
        status: s.status,
      }))
      .sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap, "id"));
  },
});

export const setPeriodStatus = mutation({
  args: { periodId: v.id("payrollPeriods"), status: v.string() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_PAYROLL_EDIT);
    const period = await ctx.db.get(args.periodId);
    if (!period) throw new Error("NOT_FOUND");
    if (!Object.values(PAYROLL_PERIOD_STATUS).includes(args.status as never)) {
      throw new Error("STATUS_INVALID");
    }
    const now = Date.now();
    const patch: Record<string, unknown> = { status: args.status, updatedAt: now };
    if (args.status === PAYROLL_PERIOD_STATUS.APPROVED) patch.approvedAt = now;
    if (args.status === PAYROLL_PERIOD_STATUS.PAID) patch.paidAt = now;
    await ctx.db.patch(period._id, patch);

    if (args.status !== PAYROLL_PERIOD_STATUS.DRAFT) {
      const slips = await ctx.db.query("payslips").collect();
      for (const slip of slips.filter((s) => s.periodId === period._id)) {
        await ctx.db.patch(slip._id, { status: args.status, updatedAt: now });
      }
    }
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "payrollPeriod",
      recordId: period._id,
      summary: `Periode payroll ${period.period} → ${args.status}`,
    });
    return { ok: true as const };
  },
});
