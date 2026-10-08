/**
 * Performance module — configurable indicators, assessments and scores.
 * No single appraisal model is hard-coded: indicators carry their own type
 * and weight, and the score is a weighted average.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import {
  PERFORMANCE_INDICATOR_TYPE,
  computePerformanceScore,
  performanceGrade,
  type PerformanceIndicatorType,
} from "../src/domain/development";
import { requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, positionName, unitName } from "./lib/names";

export const listIndicators = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const indicators = await ctx.db.query("performanceIndicators").collect();
    return indicators
      .filter((i) => i.active)
      .sort((a, b) => a.name.localeCompare(b.name, "id"))
      .map((i) => ({
        id: i._id,
        name: i.name,
        description: i.description,
        type: i.type,
        weight: i.weight,
        active: i.active,
      }));
  },
});

export const saveIndicator = mutation({
  args: {
    id: v.optional(v.id("performanceIndicators")),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
    weight: v.number(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_PERFORMANCE_EDIT);
    if (!Object.values(PERFORMANCE_INDICATOR_TYPE).includes(args.type as PerformanceIndicatorType)) {
      throw new Error("JENIS_INDIKATOR_INVALID");
    }
    if (args.weight <= 0 || args.weight > 100) throw new Error("Bobot harus antara 0 dan 100");
    const now = Date.now();
    const payload = {
      name: args.name.trim(),
      description: args.description ?? undefined,
      type: args.type,
      weight: args.weight,
      active: args.active ?? true,
      updatedAt: now,
    };
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      return { id: args.id };
    }
    const id = await ctx.db.insert("performanceIndicators", { ...payload, createdAt: now });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "performanceIndicator",
      recordId: id,
      summary: `Indikator kinerja ${args.name} dibuat`,
    });
    return { id };
  },
});

export const list = query({
  args: {
    period: v.optional(v.string()),
    employeeId: v.optional(v.id("employees")),
    bidangId: v.optional(v.id("organizationUnits")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [assessments, employees, users] = await Promise.all([
      ctx.db.query("performanceAssessments").collect(),
      ctx.db.query("employees").collect(),
      ctx.db.query("users").collect(),
    ]);
    const employeeById = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);
    const userName = new Map(users.map((u) => [u._id, u.name]));

    return assessments
      .filter((a) => (args.period ? a.period === args.period : true))
      .filter((a) => (args.employeeId ? a.employeeId === args.employeeId : true))
      .filter((a) =>
        args.bidangId ? employeeById.get(a.employeeId)?.bidangId === args.bidangId : true,
      )
      .map((assessment) => {
        const employee = employeeById.get(assessment.employeeId);
        return {
          id: assessment._id,
          employeeId: assessment.employeeId,
          namaLengkap: employee?.namaLengkap ?? "—",
          niy: employee?.niy ?? "—",
          bidang: unitName(maps, employee?.bidangId),
          jabatan: positionName(maps, employee?.jabatanId),
          period: assessment.period,
          status: assessment.status,
          finalScore: assessment.finalScore,
          grade: assessment.grade,
          summary: assessment.summary,
          evaluatorName: assessment.evaluatorId ? (userName.get(assessment.evaluatorId) ?? "—") : undefined,
        };
      })
      .sort((a, b) => b.period.localeCompare(a.period) || a.namaLengkap.localeCompare(b.namaLengkap, "id"));
  },
});

export const get = query({
  args: { id: v.id("performanceAssessments") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const assessment = await ctx.db.get(args.id);
    if (!assessment) return null;
    const scores = await ctx.db
      .query("performanceScores")
      .withIndex("assessmentId", (q) => q.eq("assessmentId", args.id))
      .collect();
    const indicators = await ctx.db.query("performanceIndicators").collect();
    const byId = new Map(indicators.map((i) => [i._id, i]));
    return {
      ...assessment,
      scores: scores.map((score) => ({
        id: score._id,
        indicatorId: score.indicatorId,
        indicatorName: byId.get(score.indicatorId)?.name,
        indicatorType: byId.get(score.indicatorId)?.type,
        target: score.target,
        value: score.value,
        weight: score.weight,
        score: score.score,
        notes: score.notes,
      })),
    };
  },
});

/** Create or update an assessment together with its per-indicator scores. */
export const saveAssessment = mutation({
  args: {
    id: v.optional(v.id("performanceAssessments")),
    employeeId: v.id("employees"),
    period: v.string(),
    summary: v.optional(v.string()),
    scores: v.array(
      v.object({
        indicatorId: v.id("performanceIndicators"),
        target: v.optional(v.number()),
        value: v.optional(v.number()),
        weight: v.optional(v.number()),
        score: v.optional(v.number()),
        notes: v.optional(v.string()),
      }),
    ),
    finalize: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_PERFORMANCE_EDIT);
    if (!/^\d{4}-\d{2}$/.test(args.period)) throw new Error("Periode harus format yyyy-mm");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    if (args.finalize) {
      const totalWeight = args.scores.reduce((sum, s) => sum + (s.weight ?? 0), 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        throw new Error(`Total bobot harus 100 (saat ini ${totalWeight})`);
      }
    }

    const indicators = await ctx.db.query("performanceIndicators").collect();
    const indicatorById = new Map(indicators.map((i) => [i._id, i]));
    for (const score of args.scores) {
      const indicator = indicatorById.get(score.indicatorId);
      if (!indicator) throw new Error("INDIKATOR_NOT_FOUND");
      if (score.target !== undefined && score.target < 0) {
        throw new Error(`Target pada ${indicator.name} tidak boleh negatif`);
      }
      if (
        indicator.type === "PERCENTAGE" &&
        score.value !== undefined &&
        (score.value < 0 || score.value > 100)
      ) {
        throw new Error(`Nilai ${indicator.name} harus 0–100`);
      }
      if (score.score !== undefined && (score.score < 0 || score.score > 100)) {
        throw new Error(`Skor ${indicator.name} harus 0–100`);
      }
    }

    const now = Date.now();
    const computed = computePerformanceScore(args.scores);
    const grade = performanceGrade(computed);
    const existingScores = args.id
      ? await ctx.db
          .query("performanceScores")
          .withIndex("assessmentId", (q) => q.eq("assessmentId", args.id!))
          .collect()
      : [];
    for (const score of existingScores) await ctx.db.delete(score._id);

    let assessmentId = args.id;
    if (assessmentId) {
      const current = await ctx.db.get(assessmentId);
      if (!current) throw new Error("NOT_FOUND");
      if (current.status !== "DRAFT") throw new Error("Penilaian yang sudah difinalkan tidak dapat diubah");
      await ctx.db.patch(assessmentId, {
        summary: args.summary ?? current.summary,
        finalScore: computed ?? undefined,
        grade: grade ?? undefined,
        status: args.finalize ? "FINALIZED" : "DRAFT",
        submittedAt: args.finalize ? now : undefined,
        updatedAt: now,
      });
    } else {
      const duplicate = (
        await ctx.db
          .query("performanceAssessments")
          .withIndex("employeeId_period", (q) =>
            q.eq("employeeId", args.employeeId).eq("period", args.period),
          )
          .unique()
      );
      if (duplicate) throw new Error("Penilaian untuk periode ini sudah ada");
      assessmentId = await ctx.db.insert("performanceAssessments", {
        employeeId: args.employeeId,
        period: args.period,
        status: args.finalize ? "FINALIZED" : "DRAFT",
        evaluatorId: user.id,
        finalScore: computed ?? undefined,
        grade: grade ?? undefined,
        summary: args.summary ?? undefined,
        submittedAt: args.finalize ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    const indicatorByScore = new Map(
      args.scores.map((s) => [s.indicatorId, indicatorById.get(s.indicatorId)]),
    );
    for (const score of args.scores) {
      await ctx.db.insert("performanceScores", {
        assessmentId,
        indicatorId: score.indicatorId,
        target: score.target ?? undefined,
        value: score.value ?? undefined,
        weight: score.weight ?? indicatorByScore.get(score.indicatorId)?.weight,
        score: score.score ?? undefined,
        notes: score.notes ?? undefined,
      });
    }

    await writeAudit(ctx, user, {
      action: args.finalize ? AUDIT_ACTION.APPROVE : AUDIT_ACTION.UPDATE,
      entity: "performanceAssessment",
      recordId: assessmentId,
      summary: `Penilaian ${employee.namaLengkap} periode ${args.period} disimpan${args.finalize ? " dan difinalkan" : ""}`,
      metadata: { skor: computed ?? "-", nilai: grade ?? "-" },
    });
    return { id: assessmentId, finalScore: computed, grade };
  },
});

export const report = query({
  args: { period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const period = args.period ?? new Date().toISOString().slice(0, 7);
    const assessments = await ctx.db
      .query("performanceAssessments")
      .withIndex("period", (q) => q.eq("period", period))
      .collect();
    const employees = await ctx.db.query("employees").collect();
    const byId = new Map(employees.map((e) => [e._id, e]));
    const maps = await loadNameMaps(ctx);
    const graded = assessments.filter((a) => a.finalScore !== undefined);
    const average =
      graded.length > 0
        ? Math.round((graded.reduce((sum, a) => sum + (a.finalScore ?? 0), 0) / graded.length) * 100) / 100
        : 0;
    return {
      period,
      total: assessments.length,
      draft: assessments.filter((a) => a.status === "DRAFT").length,
      finalized: assessments.filter((a) => a.status === "FINALIZED").length,
      averageScore: average,
      rows: assessments.map((a) => ({
        namaLengkap: byId.get(a.employeeId)?.namaLengkap ?? "—",
        bidang: unitName(maps, byId.get(a.employeeId)?.bidangId),
        finalScore: a.finalScore,
        grade: a.grade,
        status: a.status,
      })),
    };
  },
});
