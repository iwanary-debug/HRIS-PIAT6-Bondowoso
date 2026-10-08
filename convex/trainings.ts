/**
 * Training module — events, participants, certificates.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import { TRAINING_STATUS, type TrainingStatus } from "../src/domain/development";
import { requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, unitName } from "./lib/names";

export const list = query({
  args: { status: v.optional(v.string()), upcoming: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [trainings, participants, employees] = await Promise.all([
      ctx.db.query("trainings").collect(),
      ctx.db.query("trainingParticipants").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const byId = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);
    const today = new Date().toISOString().slice(0, 10);

    return trainings
      .filter((t) => (args.status ? t.status === args.status : true))
      .filter((t) => (args.upcoming ? t.startDate >= today : true))
      .map((training) => {
        const own = participants.filter((p) => p.trainingId === training._id);
        return {
          id: training._id,
          kode: training.kode,
          name: training.name,
          type: training.type,
          organizer: training.organizer,
          startDate: training.startDate,
          endDate: training.endDate,
          location: training.location,
          status: training.status,
          cost: training.cost,
          outcomeCompetencies: training.outcomeCompetencies ?? [],
          notes: training.notes,
          jumlahPeserta: own.length,
          selesai: own.filter((p) => p.status === "COMPLETED").length,
          peserta: own.map((p) => ({
            id: p._id,
            employeeId: p.employeeId,
            namaLengkap: byId.get(p.employeeId)?.namaLengkap ?? "—",
            niy: byId.get(p.employeeId)?.niy ?? "—",
            bidang: unitName(maps, byId.get(p.employeeId)?.bidangId),
            status: p.status,
            certificateNumber: p.certificateNumber,
            score: p.score,
          })),
        };
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const [trainings, participants] = await Promise.all([
      ctx.db.query("trainings").collect(),
      ctx.db.query("trainingParticipants").collect(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const certificates = participants.filter((p) => !!p.certificateNumber);
    return {
      totalTraining: trainings.length,
      totalPeserta: participants.length,
      selesai: trainings.filter((t) => t.status === "COMPLETED").length,
     Mendatang: trainings.filter((t) => t.startDate >= today && t.status === "PLANNED").length,
      berlangsung: trainings.filter((t) => t.status === "ONGOING").length,
      totalSertifikat: certificates.length,
      totalBiaya: trainings.reduce((sum, t) => sum + t.cost, 0),
      uniquePeserta: new Set(participants.map((p) => p.employeeId)).size,
    };
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("trainings")),
    kode: v.optional(v.string()),
    name: v.string(),
    type: v.string(),
    organizer: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    location: v.optional(v.string()),
    status: v.optional(v.string()),
    cost: v.optional(v.number()),
    outcomeCompetencies: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_TRAINING_EDIT);
    if (args.endDate < args.startDate) throw new Error("Tanggal selesai tidak boleh sebelum tanggal mulai");
    if (args.cost && args.cost < 0) throw new Error("Biaya tidak boleh negatif");
    const now = Date.now();
    const payload = {
      name: args.name.trim(),
      type: args.type.trim(),
      organizer: args.organizer.trim(),
      startDate: args.startDate,
      endDate: args.endDate,
      location: args.location ?? undefined,
      status: args.status ?? TRAINING_STATUS.PLANNED,
      cost: args.cost ?? 0,
      outcomeCompetencies: args.outcomeCompetencies ?? [],
      notes: args.notes ?? undefined,
      updatedAt: now,
    };
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "training",
        recordId: args.id,
        summary: `Pelatihan ${args.name} diperbarui`,
      });
      return { id: args.id };
    }
    const kode = args.kode ?? `TRN/${new Date().getFullYear()}/${String((await ctx.db.query("trainings").collect()).length + 1).padStart(3, "0")}`;
    const id = await ctx.db.insert("trainings", {
      ...payload,
      kode,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "training",
      recordId: id,
      summary: `Pelatihan ${args.name} dibuat (${kode})`,
    });
    return { id, kode };
  },
});

export const setParticipants = mutation({
  args: {
    trainingId: v.id("trainings"),
    entries: v.array(
      v.object({
        employeeId: v.id("employees"),
        status: v.optional(v.string()),
        certificateNumber: v.optional(v.string()),
        score: v.optional(v.number()),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_TRAINING_EDIT);
    const now = Date.now();
    const existing = await ctx.db
      .query("trainingParticipants")
      .withIndex("trainingId", (q) => q.eq("trainingId", args.trainingId))
      .collect();
    const keep = new Set(args.entries.map((e) => e.employeeId));
    for (const participant of existing) {
      if (!keep.has(participant.employeeId)) await ctx.db.delete(participant._id);
    }
    for (const entry of args.entries) {
      const current = existing.find((p) => p.employeeId === entry.employeeId);
      const payload = {
        trainingId: args.trainingId,
        employeeId: entry.employeeId,
        status: (entry.status ?? "PLANNED") as TrainingStatus,
        certificateNumber: entry.certificateNumber ?? undefined,
        score: entry.score ?? undefined,
        notes: entry.notes ?? undefined,
        updatedAt: now,
      };
      if (current) await ctx.db.patch(current._id, payload);
      else await ctx.db.insert("trainingParticipants", { ...payload, createdAt: now });
    }
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "training",
      recordId: args.trainingId,
      summary: `Daftar peserta pelatihan diperbarui (${args.entries.length} peserta)`,
    });
    return { ok: true as const, jumlah: args.entries.length };
  },
});

export const setStatus = mutation({
  args: { id: v.id("trainings"), status: v.string() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_TRAINING_EDIT);
    if (!Object.values(TRAINING_STATUS).includes(args.status as TrainingStatus)) {
      throw new Error("STATUS_INVALID");
    }
    const training = await ctx.db.get(args.id);
    if (!training) throw new Error("NOT_FOUND");
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "training",
      recordId: args.id,
      summary: `Pelatihan ${training.name} → ${args.status}`,
    });
    return { ok: true as const };
  },
});
