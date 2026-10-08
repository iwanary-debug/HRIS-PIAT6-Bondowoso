/**
 * Discipline, documents, mutation/promotion and resignation modules.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import {
  CLEARANCE_ITEM,
  CLEARANCE_ITEM_LABELS,
  MUTATION_TYPE,
  RESIGNATION_STATUS,
  RESIGNATION_TYPE,
  clearanceProgress,
  type ClearanceItem,
  type MutationType,
  type ResignationStatus,
  type ResignationType,
} from "../src/domain/lifecycle";
import {
  DISCIPLINE_ACTION,
  DISCIPLINE_STATUS,
  DISCIPLINE_VIOLATION_TYPE,
  type DisciplineAction,
  type DisciplineViolationType,
} from "../src/domain/development";
import { hasPermission, requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, positionName, unitName } from "./lib/names";

/* ── Discipline ─────────────────────────────────────────────────────── */

export const disciplineList = query({
  args: {
    status: v.optional(v.string()),
    employeeId: v.optional(v.id("employees")),
    bidangId: v.optional(v.id("organizationUnits")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Discipline records are sensitive: HR_VIEW alone is not enough.
    if (!hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW)) {
      throw new Error("FORBIDDEN:HR_SENSITIVE_VIEW");
    }
    const [records, employees] = await Promise.all([
      ctx.db.query("disciplineRecords").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const byId = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);
    return records
      .filter((r) => (args.status ? r.status === args.status : true))
      .filter((r) => (args.employeeId ? r.employeeId === args.employeeId : true))
      .filter((r) => (args.bidangId ? byId.get(r.employeeId)?.bidangId === args.bidangId : true))
      .map((record) => {
        const employee = byId.get(record.employeeId);
        return {
          id: record._id,
          employeeId: record.employeeId,
          namaLengkap: employee?.namaLengkap ?? "—",
          niy: employee?.niy ?? "—",
          bidang: unitName(maps, employee?.bidangId),
          jabatan: positionName(maps, employee?.jabatanId),
          incidentDate: record.incidentDate,
          violationType: record.violationType,
          description: record.description,
          action: record.action,
          status: record.status,
          followUpDate: record.followUpDate,
          coachingNotes: record.coachingNotes,
          resolvedAt: record.resolvedAt,
        };
      })
      .sort((a, b) => b.incidentDate.localeCompare(a.incidentDate));
  },
});

export const disciplineSave = mutation({
  args: {
    id: v.optional(v.id("disciplineRecords")),
    employeeId: v.id("employees"),
    incidentDate: v.string(),
    violationType: v.string(),
    description: v.string(),
    action: v.string(),
    status: v.optional(v.string()),
    followUpDate: v.optional(v.union(v.string(), v.null())),
    coachingNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_SENSITIVE_VIEW);
    if (!Object.values(DISCIPLINE_VIOLATION_TYPE).includes(args.violationType as DisciplineViolationType)) {
      throw new Error("JENIS_PELANGGARAN_INVALID");
    }
    if (!Object.values(DISCIPLINE_ACTION).includes(args.action as DisciplineAction)) {
      throw new Error("TINDAKAN_INVALID");
    }
    if (args.description.trim().length < 10) {
      throw new Error("Deskripsi pelanggaran minimal 10 karakter");
    }
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    const now = Date.now();
    const payload = {
      employeeId: args.employeeId,
      incidentDate: args.incidentDate,
      violationType: args.violationType,
      description: args.description.trim(),
      action: args.action,
      status: args.status ?? DISCIPLINE_STATUS.OPEN,
      followUpDate: args.followUpDate ?? undefined,
      coachingNotes: args.coachingNotes ?? undefined,
      recordedBy: user.id,
      updatedAt: now,
    };
    if (args.id) {
      const current = await ctx.db.get(args.id);
      await ctx.db.patch(args.id, {
        ...payload,
        resolvedAt:
          args.status === "RESOLVED" ? (current?.resolvedAt ?? now) : undefined,
      });
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "discipline",
        recordId: args.id,
        summary: `Catatan disiplin ${employee.namaLengkap} diperbarui`,
        fields: ["status", "action", "violationType", "followUpDate"],
      });
      return { id: args.id };
    }
    const id = await ctx.db.insert("disciplineRecords", { ...payload, createdAt: now });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "discipline",
      recordId: id,
      summary: `Catatan disiplin dibuka untuk ${employee.namaLengkap} (${args.action})`,
      metadata: { tanggal: args.incidentDate, tindakan: args.action },
    });
    return { id };
  },
});

/* ── Documents ──────────────────────────────────────────────────────── */

export const documentList = query({
  args: {
    employeeId: v.optional(v.id("employees")),
    category: v.optional(v.string()),
    status: v.optional(v.string()),
    bidangId: v.optional(v.id("organizationUnits")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [documents, employees] = await Promise.all([
      ctx.db.query("documents").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const byId = new Map(employees.map((e) => [e._id, e]));
    return documents
      .filter((d) => (args.employeeId ? d.employeeId === args.employeeId : true))
      .filter((d) => (args.category ? d.category === args.category : true))
      .filter((d) => (args.status ? d.status === args.status : true))
      .filter((d) =>
        args.bidangId && d.employeeId ? byId.get(d.employeeId)?.bidangId === args.bidangId : true,
      )
      .map((document) => {
        const employee = document.employeeId ? byId.get(document.employeeId) : undefined;
        return {
          id: document._id,
          employeeId: document.employeeId,
          namaLengkap: employee?.namaLengkap,
          niy: employee?.niy,
          category: document.category,
          name: document.name,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          version: document.version,
          status: document.status,
          issuedDate: document.issuedDate,
          expiryDate: document.expiryDate,
          notes: document.notes,
          hasFile: !!document.storageId,
          createdAt: document.createdAt,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Upload a file into Convex storage and register a new document version. */
export const uploadDocument = mutation({
  args: {
    employeeId: v.optional(v.id("employees")),
    category: v.string(),
    name: v.string(),
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    issuedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_DOCUMENT_EDIT);
    if (args.expiryDate && args.issuedDate && args.expiryDate < args.issuedDate) {
      throw new Error("Tanggal berlaku berakhir tidak boleh sebelum tanggal terbit");
    }
    const now = Date.now();
    const previous = args.employeeId
      ? await ctx.db
          .query("documents")
          .withIndex("employeeId_category", (q) =>
            q.eq("employeeId", args.employeeId!).eq("category", args.category),
          )
          .collect()
      : [];
    const version = previous.length + 1;
    const id = await ctx.db.insert("documents", {
      employeeId: args.employeeId ?? undefined,
      category: args.category,
      name: args.name.trim(),
      storageId: args.storageId,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      version,
      status: "PENDING",
      issuedDate: args.issuedDate ?? undefined,
      expiryDate: args.expiryDate ?? undefined,
      notes: args.notes ?? undefined,
      uploadedBy: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPLOAD,
      entity: "document",
      recordId: id,
      summary: `Dokumen ${args.name} (${args.category}) diunggah — versi ${version}`,
    });
    return { id, version };
  },
});

export const documentUrl = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_DOCUMENT_VIEW);
    const document = await ctx.db.get(args.id);
    if (!document) throw new Error("NOT_FOUND");
    if (!document.storageId) throw new Error("Dokumen belum memiliki berkas");
    const url = await ctx.storage.getUrl(document.storageId);
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.DOWNLOAD,
      entity: "document",
      recordId: args.id,
      summary: `Dokumen ${document.name} diakses`,
    });
    return { url };
  },
});

export const setDocumentStatus = mutation({
  args: { id: v.id("documents"), status: v.string() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_DOCUMENT_EDIT);
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "document",
      recordId: args.id,
      summary: `Status dokumen diubah menjadi ${args.status}`,
    });
    return { ok: true as const };
  },
});

/* ── Mutation / promotion ───────────────────────────────────────────── */

export const mutationList = query({
  args: { employeeId: v.optional(v.id("employees")), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [mutations, employees, positions, units] = await Promise.all([
      ctx.db.query("mutations").collect(),
      ctx.db.query("employees").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("organizationUnits").collect(),
    ]);
    const employeeById = new Map(employees.map((e) => [e._id, e]));
    void positions;
    void units;
    const maps = await loadNameMaps(ctx);
    return mutations
      .filter((m) => (args.employeeId ? m.employeeId === args.employeeId : true))
      .filter((m) => (args.type ? m.type === args.type : true))
      .map((mutation) => ({
        id: mutation._id,
        employeeId: mutation.employeeId,
        namaLengkap: employeeById.get(mutation.employeeId)?.namaLengkap ?? "—",
        niy: employeeById.get(mutation.employeeId)?.niy ?? "—",
        bidang: unitName(maps, employeeById.get(mutation.employeeId)?.bidangId),
        type: mutation.type,
        effectiveDate: mutation.effectiveDate,
        fromPositionName: positionName(maps, mutation.fromPositionId),
        toPositionName: positionName(maps, mutation.toPositionId),
        fromUnitName: unitName(maps, mutation.fromUnitId),
        toUnitName: unitName(maps, mutation.toUnitId),
        skNumber: mutation.skNumber,
        notes: mutation.notes,
      }))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  },
});

export const mutationSave = mutation({
  args: {
    id: v.optional(v.id("mutations")),
    employeeId: v.id("employees"),
    type: v.string(),
    effectiveDate: v.string(),
    toPositionId: v.optional(v.union(v.id("positions"), v.null())),
    toUnitId: v.optional(v.union(v.id("organizationUnits"), v.null())),
    skNumber: v.optional(v.string()),
    skDocumentId: v.optional(v.union(v.id("documents"), v.null())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    if (!Object.values(MUTATION_TYPE).includes(args.type as MutationType)) {
      throw new Error("JENIS_MUTASI_INVALID");
    }
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    if (!args.toPositionId && !args.toUnitId) {
      throw new Error("Tentukan jabatan atau unit tujuan");
    }
    const now = Date.now();
    const id = await ctx.db.insert("mutations", {
      employeeId: args.employeeId,
      type: args.type,
      effectiveDate: args.effectiveDate,
      fromPositionId: employee.jabatanId,
      toPositionId: args.toPositionId ?? undefined,
      fromUnitId: employee.bidangId,
      toUnitId: args.toUnitId ?? undefined,
      skNumber: args.skNumber ?? undefined,
      skDocumentId: args.skDocumentId ?? undefined,
      notes: args.notes ?? undefined,
      createdBy: user.id,
      createdAt: now,
    });
    if (args.toPositionId) await ctx.db.patch(employee._id, { jabatanId: args.toPositionId });
    if (args.toUnitId) await ctx.db.patch(employee._id, { bidangId: args.toUnitId });
    await ctx.db.patch(employee._id, { updatedAt: now, updatedBy: user.id });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "employee",
      recordId: employee._id,
      summary: `${args.type} ${employee.namaLengkap} efektif ${args.effectiveDate}`,
      metadata: { dari: employee.jabatanId ?? "-", ke: args.toPositionId ?? employee.jabatanId ?? "-" },
    });
    return { id };
  },
});

/* ── Resignation / termination ──────────────────────────────────────── */

const DEFAULT_CLEARANCE = Object.values(CLEARANCE_ITEM).map((item) => ({
  item: item as ClearanceItem,
  label: CLEARANCE_ITEM_LABELS[item as ClearanceItem],
  cleared: false,
}));

export const resignationList = query({
  args: { status: v.optional(v.string()), employeeId: v.optional(v.id("employees")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [records, employees] = await Promise.all([
      ctx.db.query("resignations").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const byId = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);
    return records
      .filter((r) => (args.status ? r.status === args.status : true))
      .filter((r) => (args.employeeId ? r.employeeId === args.employeeId : true))
      .map((record) => {
        const employee = byId.get(record.employeeId);
        return {
          id: record._id,
          employeeId: record.employeeId,
          namaLengkap: employee?.namaLengkap ?? "—",
          niy: employee?.niy ?? "—",
          bidang: unitName(maps, employee?.bidangId),
          jabatan: positionName(maps, employee?.jabatanId),
          nomor: record.nomor,
          type: record.type,
          lastWorkingDate: record.lastWorkingDate,
          reason: record.reason,
          status: record.status,
          clearances: record.clearances,
          progress: clearanceProgress(record),
          notes: record.notes,
          completedAt: record.completedAt,
        };
      })
      .sort((a, b) => b.lastWorkingDate.localeCompare(a.lastWorkingDate));
  },
});

export const resignationSave = mutation({
  args: {
    id: v.optional(v.id("resignations")),
    employeeId: v.id("employees"),
    nomor: v.optional(v.string()),
    type: v.string(),
    lastWorkingDate: v.string(),
    reason: v.string(),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    if (!Object.values(RESIGNATION_TYPE).includes(args.type as ResignationType)) {
      throw new Error("JENIS_PENGUNDURAN_INVALID");
    }
    if (args.reason.trim().length < 5) throw new Error("Alasan wajib diisi minimal 5 karakter");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    const now = Date.now();

    if (args.id) {
      const record = await ctx.db.get(args.id);
      if (!record) throw new Error("NOT_FOUND");
      const nextStatus = (args.status ?? record.status) as ResignationStatus;
      await ctx.db.patch(args.id, {
        type: args.type,
        lastWorkingDate: args.lastWorkingDate,
        reason: args.reason.trim(),
        status: nextStatus,
        notes: args.notes ?? record.notes,
        completedAt: nextStatus === "COMPLETED" ? now : undefined,
        updatedAt: now,
      });
      // Exit is a status change — the employee record itself is never deleted.
      if (nextStatus === "COMPLETED" && employee.status === "AKTIF") {
        await ctx.db.patch(employee._id, {
          status: args.type === "TERMINASI" ? "TERMINASI" : "RESIGN",
          tmtResign: args.lastWorkingDate,
          updatedAt: now,
          updatedBy: user.id,
        });
      }
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "resignation",
        recordId: args.id,
        summary: `Pengunduran ${record.nomor} diperbarui → ${nextStatus}`,
        fields: ["type", "lastWorkingDate", "status", "reason"],
      });
      return { id: args.id };
    }

    const existing = await ctx.db.query("resignations").collect();
    const nomor =
      args.nomor ??
      `RES/${new Date().getFullYear()}/${String(existing.length + 1).padStart(4, "0")}`;
    const id = await ctx.db.insert("resignations", {
      employeeId: args.employeeId,
      nomor,
      type: args.type,
      lastWorkingDate: args.lastWorkingDate,
      reason: args.reason.trim(),
      status: args.status ?? RESIGNATION_STATUS.PENDING,
      clearances: DEFAULT_CLEARANCE,
      notes: args.notes ?? undefined,
      requestedBy: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "resignation",
      recordId: id,
      summary: `Pengunduran ${nomor} dicatat untuk ${employee.namaLengkap}`,
      metadata: { tipe: args.type, tanggal: args.lastWorkingDate },
    });
    return { id, nomor };
  },
});

export const setClearance = mutation({
  args: {
    id: v.id("resignations"),
    item: v.string(),
    cleared: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("NOT_FOUND");
    const now = Date.now();
    const clearances = record.clearances.map((entry) =>
      entry.item === args.item
        ? {
            ...entry,
            cleared: args.cleared,
            clearedBy: args.cleared ? user.name : undefined,
            clearedAt: args.cleared ? now : undefined,
            notes: args.notes ?? entry.notes,
          }
        : entry,
    );
    const allCleared = clearances.every((entry) => entry.cleared);
    await ctx.db.patch(record._id, {
      clearances,
      status: allCleared ? RESIGNATION_STATUS.COMPLETED : record.status,
      completedAt: allCleared ? now : record.completedAt,
      updatedAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "resignation",
      recordId: args.id,
      summary: `Clearance ${args.item} → ${args.cleared ? "selesai" : "belum"}`,
    });
    return { ok: true as const, allCleared };
  },
});

export const clearances = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const records = await ctx.db.query("resignations").collect();
    const progress = records.map((record) => clearanceProgress(record));
    return {
      total: records.length,
      pending: records.filter((r) => r.status === "PENDING").length,
      inClearance: records.filter((r) => r.status === "IN_CLEARANCE").length,
      completed: records.filter((r) => r.status === "COMPLETED").length,
      averageProgress:
        progress.length > 0
          ? Math.round(progress.reduce((sum, p) => sum + p.percent, 0) / progress.length)
          : 0,
    };
  },
});
