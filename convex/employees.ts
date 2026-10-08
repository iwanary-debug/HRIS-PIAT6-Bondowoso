/**
 * Employee master — read API.
 * Search / filter / sort / paginate all happen server-side so the permission
 * check and the redaction happen before anything leaves the backend.
 *
 * `revealSensitive` and `exportRows` are mutations on purpose: both are audited
 * events and a Convex query cannot write an audit row.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import { hasPermission, requireUser } from "./lib/auth";
import { projectEmployee, projectEmployeeSummary } from "./lib/employeeRepository";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { buildEmployeeQuery, sortEmployees, type EmployeeFilters } from "./lib/employeeQuery";
import type { QueryCtx } from "./_generated/server";

interface NameMaps {
  unitNames: Map<string, string>;
  positionNames: Map<string, string>;
  unitIdByName: Map<string, string>;
  positionIdByName: Map<string, string>;
}

async function lookupMaps(ctx: QueryCtx): Promise<NameMaps> {
  const units = await ctx.db.query("organizationUnits").collect();
  const positions = await ctx.db.query("positions").collect();
  const unitNames = new Map<string, string>();
  const unitIdByName = new Map<string, string>();
  for (const unit of units) {
    unitNames.set(unit._id, unit.nama);
    unitIdByName.set(unit.nama.trim().toLowerCase(), unit._id);
  }
  const positionNames = new Map<string, string>();
  const positionIdByName = new Map<string, string>();
  for (const position of positions) {
    positionNames.set(position._id, position.nama);
    positionIdByName.set(position.nama.trim().toLowerCase(), position._id);
  }
  return { unitNames, positionNames, unitIdByName, positionIdByName };
}

const filtersValidator = {
  search: v.optional(v.string()),
  status: v.optional(v.array(v.string())),
  bidangId: v.optional(v.array(v.string())),
  jabatanId: v.optional(v.array(v.string())),
  statusAkad: v.optional(v.array(v.string())),
  masaKerjaMin: v.optional(v.number()),
  includeInactive: v.optional(v.boolean()),
  page: v.optional(v.number()),
  pageSize: v.optional(v.number()),
  sortBy: v.optional(v.string()),
  sortDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
};

export const list = query({
  args: filtersValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { unitNames, positionNames, unitIdByName, positionIdByName } = await lookupMaps(ctx);
    const documents = await ctx.db.query("employees").collect();

    const filters: EmployeeFilters = {
      search: args.search,
      status: args.status,
      bidangId: args.bidangId,
      jabatanId: args.jabatanId,
      statusAkad: args.statusAkad,
      masaKerjaMin: args.masaKerjaMin,
      includeInactive: args.includeInactive ?? true,
      unitIdByName,
      positionIdByName,
      unitNames,
      positionNames,
      scopedUnitId: user.role === "UNIT_MANAGER" ? user.unitId : undefined,
      scopeEmployeeId: user.role === "EMPLOYEE_SELF_SERVICE" ? user.employeeId : undefined,
    };

    const filtered = sortEmployees(
      buildEmployeeQuery(documents, filters),
      args.sortBy ?? "namaLengkap",
      args.sortDir ?? "asc",
      { unitNames, positionNames },
    );
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(200, Math.max(5, args.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);

    const includeContact = hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW);
    return {
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      canViewSensitive: includeContact,
      data: rows.map((employee) =>
        projectEmployeeSummary(employee, {
          unitNames,
          positionNames,
          includeContact,
        }),
      ),
    };
  },
});

export const facets = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const [units, positions, employees] = await Promise.all([
      ctx.db.query("organizationUnits").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const active = employees.filter((e) => e.status === "AKTIF");
    return {
      bidang: units
        .filter((unit) => unit.active)
        .map((unit) => ({ id: unit._id, nama: unit.nama, jumlah: active.filter((e) => e.bidangId === unit._id).length }))
        .sort((a, b) => a.nama.localeCompare(b.nama, "id")),
      jabatan: positions
        .filter((position) => position.active)
        .map((position) => ({ id: position._id, nama: position.nama, jumlah: active.filter((e) => e.jabatanId === position._id).length }))
        .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama, "id")),
      status: ["AKTIF", "TIDAK_AKTIF", "RESIGN", "TERMINASI"].map((status) => ({
        value: status,
        jumlah: employees.filter((e) => e.status === status).length,
      })),
      statusAkad: ["PKWT", "PKWTT"].map((statusAkad) => ({
        value: statusAkad,
        jumlah: employees.filter((e) => e.statusAkad === statusAkad).length,
      })),
    };
  },
});

export const get = query({
  args: { id: v.id("employees") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const employee = await ctx.db.get(args.id);
    if (!employee) return null;
    if (user.role === "EMPLOYEE_SELF_SERVICE" && user.employeeId !== employee._id) return null;
    const { unitNames, positionNames } = await lookupMaps(ctx);
    return projectEmployee(employee, {
      unitNames,
      positionNames,
      includeSensitive: hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW),
    });
  },
});

/**
 * Revealing sensitive values (NIK / BPJS / rekening / alamat) is a separate,
 * explicitly audited call — not something the list endpoint can leak.
 */
export const revealSensitive = mutation({
  args: { id: v.id("employees"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW)) {
      throw new Error("FORBIDDEN:HR_SENSITIVE_VIEW");
    }
    const employee = await ctx.db.get(args.id);
    if (!employee) return null;
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.VIEW_SENSITIVE,
      entity: "employee",
      recordId: employee._id,
      summary: `Data sensitif karyawan ${employee.niy} — ${employee.namaLengkap} diakses`,
      metadata: { alasan: args.reason ?? "-", fields: "nik,bpjsKesehatanNumber,noRekening,alamatKtp" },
    });
    return {
      nik: employee.nik,
      bpjsKesehatanNumber: employee.bpjsKesehatanNumber,
      noRekening: employee.noRekening,
      alamatKtp: employee.alamatKtp,
      noHp: employee.noHp,
      email: employee.email,
      tempatLahir: employee.tempatLahir,
    };
  },
});

export const exportRows = mutation({
  args: filtersValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!hasPermission(user, PERMISSIONS.HR_EXPORT)) {
      throw new Error("FORBIDDEN:HR_EXPORT");
    }
    const { unitNames, positionNames, unitIdByName, positionIdByName } = await lookupMaps(ctx);
    const documents = await ctx.db.query("employees").collect();
    const filtered = buildEmployeeQuery(documents, {
      search: args.search,
      status: args.status,
      bidangId: args.bidangId,
      jabatanId: args.jabatanId,
      statusAkad: args.statusAkad,
      includeInactive: args.includeInactive ?? true,
      unitIdByName,
      positionIdByName,
      unitNames,
      positionNames,
    });
    const includeSensitive = hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW);
    const rows = filtered.map((employee) =>
      projectEmployee(employee, { unitNames, positionNames, includeSensitive }),
    );
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.EXPORT,
      entity: "employee",
      summary: `Export ${rows.length} baris data karyawan`,
      metadata: {
        baris: rows.length,
        sensitif: includeSensitive,
        filter: JSON.stringify({
          status: args.status ?? null,
          bidang: args.bidangId?.length ?? 0,
        }),
      },
    });
    return { rows, generatedAt: Date.now(), includeSensitive };
  },
});

export const niyExists = query({
  args: { niy: v.string(), excludeId: v.optional(v.id("employees")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const existing = await ctx.db
      .query("employees")
      .withIndex("niy", (q) => q.eq("niy", args.niy))
      .unique();
    if (existing && existing._id !== args.excludeId) return existing.namaLengkap;
    return null;
  },
});
