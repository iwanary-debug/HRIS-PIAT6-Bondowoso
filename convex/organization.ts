/**
 * Organization domain API — units (bidang), positions (jabatan) and the
 * organisation chart. Seeded from the repository reference CSVs.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import { POSITION_LEVEL, type OrgNode, type PositionLevel } from "../src/domain/organization";
import { requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";

export const listUnits = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const units = await ctx.db.query("organizationUnits").collect();
    const positions = await ctx.db.query("positions").collect();
    const employees = await ctx.db.query("employees").collect();
    const assignments = await ctx.db.query("positionAssignments").collect();

    const activeEmployeeIds = new Set(
      employees.filter((e) => e.status === "AKTIF").map((e) => e._id),
    );

    return units
      .filter((unit) => args.includeInactive ?? unit.active)
      .map((unit) => {
        const memberIds = new Set(
          assignments
            .filter(
              (a) => a.unitId === unit._id && !a.selesai && activeEmployeeIds.has(a.employeeId),
            )
            .map((a) => a.employeeId),
        );
        return {
          id: unit._id,
          kode: unit.kode,
          nama: unit.nama,
          type: unit.type,
          parentId: unit.parentId,
          keterangan: unit.keterangan,
          active: unit.active,
          jumlahKaryawan: memberIds.size,
          jumlahPosisi: positions.filter((p) => p.unitId === unit._id && p.active).length,
        };
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  },
});

export const listPositions = query({
  args: { unitId: v.optional(v.id("organizationUnits")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const positions = await ctx.db.query("positions").collect();
    const units = await ctx.db.query("organizationUnits").collect();
    const employees = await ctx.db.query("employees").collect();
    const assignments = await ctx.db.query("positionAssignments").collect();
    const unitName = new Map(units.map((u) => [u._id, u.nama]));
    const activeIds = new Set(employees.filter((e) => e.status === "AKTIF").map((e) => e._id));

    return positions
      .filter((p) => (args.unitId ? p.unitId === args.unitId : true))
      .map((position) => {
        const holder = assignments.find(
          (a) => a.positionId === position._id && !a.selesai && activeIds.has(a.employeeId),
        );
        const employee = holder ? employees.find((e) => e._id === holder.employeeId) : undefined;
        return {
          id: position._id,
          kode: position.kode,
          nama: position.nama,
          level: position.level,
          isStructural: position.isStructural,
          unitId: position.unitId,
          unitName: position.unitId ? unitName.get(position.unitId) : undefined,
          reportsToPositionId: position.reportsToPositionId,
          active: position.active,
          holder: employee
            ? { id: employee._id, namaLengkap: employee.namaLengkap, niy: employee.niy }
            : null,
        };
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  },
});

/** Tree of units → positions → holders, for the org chart. */
export const orgChart = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const [units, positions, assignments, employees] = await Promise.all([
      ctx.db.query("organizationUnits").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("positionAssignments").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const activeIds = new Set(employees.filter((e) => e.status === "AKTIF").map((e) => e._id));
    const employeeById = new Map(employees.map((e) => [e._id, e]));

    const holderOf = (positionId: string) => {
      const assignment = assignments.find(
        (a) => a.positionId === positionId && !a.selesai && activeIds.has(a.employeeId),
      );
      if (!assignment) return undefined;
      const employee = employeeById.get(assignment.employeeId);
      return employee
        ? { _id: employee._id, namaLengkap: employee.namaLengkap, niy: employee.niy }
        : undefined;
    };

    const childNodes = (parentPositionId?: string): OrgNode[] =>
      positions
        .filter(
          (p) =>
            p.active &&
            (p.reportsToPositionId ?? undefined) === (parentPositionId ?? undefined),
        )
        .map((position) => ({
          position: {
            _id: position._id,
            kode: position.kode,
            nama: position.nama,
            level: position.level as PositionLevel,
            isStructural: position.isStructural,
            unitId: position.unitId,
            reportsToPositionId: position.reportsToPositionId,
            keterangan: position.keterangan,
            active: position.active,
            createdAt: position.createdAt,
            updatedAt: position.updatedAt,
          },
          holder: holderOf(position._id),
          children: childNodes(position._id),
        }));

    const roots = childNodes(undefined);
    const rootUnits = units
      .filter((u) => u.active && !u.parentId)
      .map((unit) => ({
        unit: {
          _id: unit._id,
          kode: unit.kode,
          nama: unit.nama,
          type: unit.type,
          parentId: unit.parentId,
          headPositionId: unit.headPositionId,
          keterangan: unit.keterangan,
          active: unit.active,
          createdAt: unit.createdAt,
          updatedAt: unit.updatedAt,
        },
        children: roots.filter((node) => node.position?.unitId === unit._id),
      }));

    // Any position not attached to a root unit still needs to be visible.
    const attached = new Set(rootUnits.flatMap((u) => u.children.map((c) => c.position?._id)));
    const orphans = roots.filter((node) => !attached.has(node.position?._id));

    return { rootUnits, orphans, totalPositions: positions.length, totalUnits: units.length };
  },
});

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const saveUnit = mutation({
  args: {
    id: v.optional(v.id("organizationUnits")),
    kode: v.string(),
    nama: v.string(),
    type: v.optional(v.string()),
    parentId: v.optional(v.union(v.id("organizationUnits"), v.null())),
    keterangan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    const now = Date.now();
    const payload = {
      kode: args.kode || slug(args.nama).toUpperCase(),
      nama: args.nama.trim(),
      type: args.type ?? "BIDANG",
      parentId: args.parentId ?? undefined,
      keterangan: args.keterangan ?? undefined,
      active: true,
      updatedAt: now,
    };
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "organizationUnit",
        recordId: args.id,
        summary: `Unit ${payload.nama} diperbarui`,
      });
      return { id: args.id };
    }
    const id = await ctx.db.insert("organizationUnits", { ...payload, createdAt: now });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "organizationUnit",
      recordId: id,
      summary: `Unit ${payload.nama} dibuat`,
    });
    return { id };
  },
});

export const savePosition = mutation({
  args: {
    id: v.optional(v.id("positions")),
    kode: v.string(),
    nama: v.string(),
    level: v.optional(v.string()),
    unitId: v.optional(v.union(v.id("organizationUnits"), v.null())),
    reportsToPositionId: v.optional(v.union(v.id("positions"), v.null())),
    isStructural: v.optional(v.boolean()),
    keterangan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    const now = Date.now();
    if (args.reportsToPositionId && args.reportsToPositionId === args.id) {
      throw new Error("Jabatan tidak dapat melapor ke dirinya sendiri");
    }
    const payload = {
      kode: args.kode || slug(args.nama).toUpperCase(),
      nama: args.nama.trim().toUpperCase(),
      level: args.level ?? POSITION_LEVEL.PELAKSANA,
      unitId: args.unitId ?? undefined,
      reportsToPositionId: args.reportsToPositionId ?? undefined,
      isStructural: args.isStructural ?? false,
      keterangan: args.keterangan ?? undefined,
      active: true,
      updatedAt: now,
    };
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "position",
        recordId: args.id,
        summary: `Jabatan ${payload.nama} diperbarui`,
      });
      return { id: args.id };
    }
    const id = await ctx.db.insert("positions", { ...payload, createdAt: now });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "position",
      recordId: id,
      summary: `Jabatan ${payload.nama} dibuat`,
    });
    return { id };
  },
});

/** Assign (or reassign) an employee to a position and unit. */
export const assignPosition = mutation({
  args: {
    employeeId: v.id("employees"),
    positionId: v.id("positions"),
    unitId: v.id("organizationUnits"),
    supervisorId: v.optional(v.union(v.id("employees"), v.null())),
    mulai: v.optional(v.string()),
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("NOT_FOUND");
    const position = await ctx.db.get(args.positionId);
    if (!position) throw new Error("JABATAN_NOT_FOUND");
    const now = Date.now();
    const mulai = args.mulai ?? new Date().toISOString().slice(0, 10);

    // Close the current primary assignment; history is kept, never deleted.
    const current = await ctx.db
      .query("positionAssignments")
      .withIndex("employeeId", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    for (const assignment of current) {
      if (assignment.isPrimary && !assignment.selesai) {
        await ctx.db.patch(assignment._id, { selesai: mulai });
      }
    }

    await ctx.db.insert("positionAssignments", {
      employeeId: args.employeeId,
      positionId: args.positionId,
      unitId: args.unitId,
      supervisorId: args.supervisorId ?? undefined,
      isPrimary: true,
      mulai,
      alasan: args.alasan ?? undefined,
      createdAt: now,
    });

    await ctx.db.patch(employee._id, {
      jabatanId: args.positionId,
      bidangId: args.unitId,
      updatedAt: now,
      updatedBy: user.id,
    });

    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "employee",
      recordId: employee._id,
      summary: `${employee.namaLengkap} ditempatkan sebagai ${position.nama}`,
      metadata: { jabatan: position.nama, mulai },
    });
    return { ok: true as const };
  },
});

/** Reporting lines: atasan (supervisor) and bawahan (direct reports). */
export const reportingLines = query({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const assignments = await ctx.db
      .query("positionAssignments")
      .withIndex("employeeId", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    const primary = assignments.find((a) => a.isPrimary && !a.selesai);
    const employees = await ctx.db.query("employees").collect();
    const positions = await ctx.db.query("positions").collect();
    const byId = new Map(employees.map((e) => [e._id, e]));

    const reports = assignments
      .filter((a) => a.supervisorId === args.employeeId)
      .map((a) => {
        const employee = byId.get(a.employeeId);
        const position = positions.find((p) => p._id === a.positionId);
        return employee
          ? { id: employee._id, namaLengkap: employee.namaLengkap, niy: employee.niy, jabatan: position?.nama }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const supervisor = primary?.supervisorId ? byId.get(primary.supervisorId) : undefined;
    return {
      supervisor: supervisor
        ? { id: supervisor._id, namaLengkap: supervisor.namaLengkap, niy: supervisor.niy }
        : null,
      position: primary
        ? positions.find((p) => p._id === primary.positionId)?.nama
        : undefined,
      reports,
    };
  },
});
