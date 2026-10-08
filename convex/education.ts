/**
 * Education & competency module.
 * The three flat workbook columns seed the first EducationRecord; everything
 * beyond that is first-class history.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import { EDUCATION_LEVEL_OPTIONS } from "../src/domain/development";
import { requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, unitName } from "./lib/names";

export const educationLevels = query({
  args: {},
  handler: async () => EDUCATION_LEVEL_OPTIONS,
});

export const listEducation = query({
  args: { employeeId: v.optional(v.id("employees")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const records = await ctx.db.query("educationRecords").collect();
    const employees = await ctx.db.query("employees").collect();
    const byId = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);
    return records
      .filter((r) => (args.employeeId ? r.employeeId === args.employeeId : true))
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.createdAt - a.createdAt)
      .map((record) => ({
        id: record._id,
        employeeId: record.employeeId,
        namaLengkap: byId.get(record.employeeId)?.namaLengkap ?? "—",
        niy: byId.get(record.employeeId)?.niy ?? "—",
        bidang: unitName(maps, byId.get(record.employeeId)?.bidangId),
        level: record.level,
        institution: record.institution,
        major: record.major,
        graduationYear: record.graduationYear,
        isCurrent: record.isCurrent,
        notes: record.notes,
      }));
  },
});

export const saveEducation = mutation({
  args: {
    id: v.optional(v.id("educationRecords")),
    employeeId: v.id("employees"),
    level: v.string(),
    institution: v.string(),
    major: v.optional(v.string()),
    graduationYear: v.optional(v.union(v.number(), v.null())),
    isCurrent: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    if (!EDUCATION_LEVEL_OPTIONS.some((l) => l.value === args.level)) {
      throw new Error("JENJANG_PENDIDIKAN_INVALID");
    }
    if (args.graduationYear && (args.graduationYear < 1950 || args.graduationYear > 2100)) {
      throw new Error("Tahun lulus tidak valid");
    }
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    const now = Date.now();
    const isCurrent = args.isCurrent ?? true;

    if (args.id) {
      await ctx.db.patch(args.id, {
        level: args.level,
        institution: args.institution.trim(),
        major: args.major ?? undefined,
        graduationYear: args.graduationYear ?? undefined,
        isCurrent,
        notes: args.notes ?? undefined,
        updatedAt: now,
      });
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "education",
        recordId: args.id,
        summary: `Riwayat pendidikan ${employee.namaLengkap} diperbarui`,
        fields: ["level", "institution", "major", "graduationYear", "isCurrent"],
      });
      return { id: args.id };
    }

    // Only one current record per employee.
    if (isCurrent) {
      const others = await ctx.db
        .query("educationRecords")
        .withIndex("employeeId", (q) => q.eq("employeeId", args.employeeId))
        .collect();
      for (const other of others) {
        if (other.isCurrent) await ctx.db.patch(other._id, { isCurrent: false, updatedAt: now });
      }
    }
    const id = await ctx.db.insert("educationRecords", {
      employeeId: args.employeeId,
      level: args.level,
      institution: args.institution.trim(),
      major: args.major ?? undefined,
      graduationYear: args.graduationYear ?? undefined,
      isCurrent,
      notes: args.notes ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
    // Keep the denormalised employee columns in sync with the current record.
    if (isCurrent) {
      await ctx.db.patch(employee._id, {
        pendidikanTerakhir: args.level,
        universitas: args.institution.trim(),
        jurusan: args.major ?? undefined,
        updatedAt: now,
        updatedBy: user.id,
      });
    }
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "education",
      recordId: id,
      summary: `Riwayat pendidikan ${args.level} ditambahkan untuk ${employee.namaLengkap}`,
    });
    return { id };
  },
});

export const deleteEducation = mutation({
  args: { id: v.id("educationRecords") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_DELETE);
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("NOT_FOUND");
    await ctx.db.delete(args.id);
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.DELETE,
      entity: "education",
      recordId: args.id,
      summary: "Riwayat pendidikan dihapus",
      metadata: { jenjang: record.level, institusi: record.institution },
    });
    return { ok: true as const };
  },
});

/* ── Competency ─────────────────────────────────────────────────────── */

export const listCompetencies = query({
  args: { employeeId: v.optional(v.id("employees")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [master, assigned] = await Promise.all([
      ctx.db.query("competencies").collect(),
      ctx.db.query("employeeCompetencies").collect(),
    ]);
    const byId = new Map(master.map((c) => [c._id, c]));
    const employees = await ctx.db.query("employees").collect();
    const maps = await loadNameMaps(ctx);
    const employeeById = new Map(employees.map((e) => [e._id, e]));

    return assigned
      .filter((c) => (args.employeeId ? c.employeeId === args.employeeId : true))
      .map((record) => {
        const competency = byId.get(record.competencyId);
        return {
          id: record._id,
          employeeId: record.employeeId,
          namaLengkap: employeeById.get(record.employeeId)?.namaLengkap ?? "—",
          bidang: unitName(maps, employeeById.get(record.employeeId)?.bidangId),
          competencyId: record.competencyId,
          name: competency?.name ?? "—",
          category: competency?.category ?? "—",
          level: record.level,
          assessedAt: record.assessedAt,
          notes: record.notes,
          certificationDocumentId: record.certificationDocumentId,
        };
      })
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "id"));
  },
});

export const listMaster = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const master = await ctx.db.query("competencies").collect();
    return master
      .filter((c) => args.includeInactive ?? c.active)
      .sort((a, b) => a.category.localeCompare(b.category, "id") || a.name.localeCompare(b.name, "id"));
  },
});

export const saveMaster = mutation({
  args: {
    id: v.optional(v.id("competencies")),
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    const now = Date.now();
    const payload = {
      name: args.name.trim(),
      category: args.category.trim(),
      description: args.description ?? undefined,
      active: args.active ?? true,
      updatedAt: now,
    };
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      return { id: args.id };
    }
    const id = await ctx.db.insert("competencies", { ...payload, createdAt: now });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "competency",
      recordId: id,
      summary: `Kompetensi ${args.name} ditambahkan ke master`,
    });
    return { id };
  },
});

export const assignCompetency = mutation({
  args: {
    id: v.optional(v.id("employeeCompetencies")),
    employeeId: v.id("employees"),
    competencyId: v.id("competencies"),
    level: v.number(),
    assessedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    if (args.level < 1 || args.level > 5) throw new Error("Level kompetensi harus 1–5");
    const now = Date.now();
    const payload = {
      employeeId: args.employeeId,
      competencyId: args.competencyId,
      level: args.level,
      assessedAt: args.assessedAt ?? new Date(now).toISOString().slice(0, 10),
      assessedBy: user.id,
      notes: args.notes ?? undefined,
      updatedAt: now,
    };
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      return { id: args.id };
    }
    const id = await ctx.db.insert("employeeCompetencies", { ...payload, createdAt: now });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "employeeCompetency",
      recordId: id,
      summary: `Kompetensi asignasi baru (level ${args.level})`,
    });
    return { id };
  },
});
