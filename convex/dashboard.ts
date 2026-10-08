/**
 * Dashboard aggregation.
 * All numbers are computed from the live tables — there is no cached or
 * hard-coded KPI. Filters (period, unit, position, status) apply server-side.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";
import { evaluateContractStatus } from "../src/domain/contract";
import { buildMonth, summarizeAttendance } from "../src/domain/attendance";
import { calculateTenure } from "../src/domain/tenure";
import { EDUCATION_LEVEL_OPTIONS } from "../src/domain/development";

const DAY = 86_400_000;

export const kpis = query({
  args: {
    bidangId: v.optional(v.id("organizationUnits")),
    jabatanId: v.optional(v.id("positions")),
    status: v.optional(v.string()),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [employees, contracts, leave, attendance] = await Promise.all([
      ctx.db.query("employees").collect(),
      ctx.db.query("contracts").collect(),
      ctx.db.query("leaveRequests").collect(),
      ctx.db.query("attendanceRecords").collect(),
    ]);

    const scoped = employees.filter(
      (e) =>
        (!args.bidangId || e.bidangId === args.bidangId) &&
        (!args.jabatanId || e.jabatanId === args.jabatanId) &&
        (!args.status || e.status === args.status),
    );
    const active = scoped.filter((e) => e.status === "AKTIF");
    const scopedIds = new Set(scoped.map((e) => e._id));

    const period = args.period ?? new Date().toISOString().slice(0, 7);
    const month = buildMonth(period);
    const periodAttendance = attendance.filter(
      (r) => month.some((d) => d.date === r.date) && scopedIds.has(r.employeeId),
    );
    const attendanceSummary = summarizeAttendance(periodAttendance, {
      totalDays: month.filter((d) => !d.isSunday).length,
    });

    const activeContracts = contracts.filter(
      (c) => c.status === "AKTIF" && scopedIds.has(c.employeeId),
    );
    const contractAlerts = activeContracts
      .map((c) => evaluateContractStatus(c.selesai))
      .filter((r) => r.status !== "AMAN").length;

    const pendingLeave = leave.filter(
      (l) => l.status === "PENDING" && scopedIds.has(l.employeeId),
    ).length;

    const documents = await ctx.db.query("documents").collect();
    const requiredCategories = ["KTP", "IJAZAH", "SK"];
    const incompleteDocuments = active.filter(
      (e) =>
        !requiredCategories.every((category) =>
          documents.some(
            (d) => d.employeeId === e._id && d.category === category && d.status === "VERIFIED",
          ),
        ),
    ).length;

    return {
      total: scoped.length,
      aktif: active.length,
      nonAktif: scoped.filter((e) => e.status !== "AKTIF").length,
      resign: scoped.filter((e) => e.status === "RESIGN" || e.status === "TERMINASI").length,
      pkwt: active.filter((e) => e.statusAkad === "PKWT").length,
      pkwtt: active.filter((e) => e.statusAkad === "PKWTT").length,
      kontrakPerluPerhatian: contractAlerts,
      kontrakLewat: activeContracts.filter(
        (c) => evaluateContractStatus(c.selesai).status === "LEWAT",
      ).length,
      cutiPending: pendingLeave,
      kehadiran: attendanceSummary.attendanceRate,
      hadirBulanIni: attendanceSummary.hadir,
      alfa: attendanceSummary.alfa,
      terlambat: attendanceSummary.late,
     izin: attendanceSummary.izin,
      sakit: attendanceSummary.sakit,
      dokumenBelumLengkap: incompleteDocuments,
      periode: period,
    };
  },
});

export const breakdowns = query({
  args: {
    bidangId: v.optional(v.id("organizationUnits")),
    jabatanId: v.optional(v.id("positions")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [employees, units, positions] = await Promise.all([
      ctx.db.query("employees").collect(),
      ctx.db.query("organizationUnits").collect(),
      ctx.db.query("positions").collect(),
    ]);
    const unitName = new Map(units.map((u) => [u._id, u.nama]));
    const positionName = new Map(positions.map((p) => [p._id, p.nama]));

    const scoped = employees.filter(
      (e) =>
        (!args.bidangId || e.bidangId === args.bidangId) &&
        (!args.jabatanId || e.jabatanId === args.jabatanId) &&
        (!args.status || e.status === args.status),
    );
    const active = scoped.filter((e) => e.status === "AKTIF");

    const tally = <T,>(items: T[], key: (item: T) => string | undefined) => {
      const map = new Map<string, number>();
      for (const item of items) {
        const value = key(item);
        if (!value) continue;
        map.set(value, (map.get(value) ?? 0) + 1);
      }
      return [...map.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    };

    // Tenure buckets use computed tenure, never the imported string.
    const tenureBuckets = [
      { name: "< 1 Tahun", value: 0 },
      { name: "1–3 Tahun", value: 0 },
      { name: "3–5 Tahun", value: 0 },
      { name: "5–10 Tahun", value: 0 },
      { name: "> 10 Tahun", value: 0 },
    ];
    for (const employee of active) {
      const tenure = calculateTenure(employee.tanggalBergabung);
      const months = tenure?.totalMonths ?? 0;
      if (months < 12) tenureBuckets[0]!.value += 1;
      else if (months < 36) tenureBuckets[1]!.value += 1;
      else if (months < 60) tenureBuckets[2]!.value += 1;
      else if (months < 120) tenureBuckets[3]!.value += 1;
      else tenureBuckets[4]!.value += 1;
    }

    return {
      perBidang: tally(active, (e) => (e.bidangId ? unitName.get(e.bidangId) : undefined)),
      perJabatan: tally(active, (e) => (e.jabatanId ? positionName.get(e.jabatanId) : undefined)).slice(
        0,
        12,
      ),
      perStatusAkad: tally(active, (e) => e.statusAkad),
      perPendidikan: EDUCATION_LEVEL_OPTIONS.map((level) => ({
        name: level.label,
        value: active.filter((e) => e.pendidikanTerakhir === level.value).length,
      })).filter((row) => row.value > 0),
      perStatusPernikahan: tally(active, (e) => e.statusPernikahan),
      perMasaKerja: tenureBuckets,
      perStatus: tally(scoped, (e) => e.status),
    };
  },
});

export const contractWatch = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [contracts, employees, units] = await Promise.all([
      ctx.db.query("contracts").collect(),
      ctx.db.query("employees").collect(),
      ctx.db.query("organizationUnits").collect(),
    ]);
    const employeeById = new Map(employees.map((e) => [e._id, e]));
    const unitName = new Map(units.map((u) => [u._id, u.nama]));

    const rows = contracts
      .filter((c) => c.status === "AKTIF" && c.selesai)
      .map((c) => {
        const employee = employeeById.get(c.employeeId);
        if (!employee || employee.status !== "AKTIF") return null;
        const evaluation = evaluateContractStatus(c.selesai);
        if (evaluation.status === "AMAN") return null;
        return {
          contractId: c._id,
          employeeId: employee._id,
          namaLengkap: employee.namaLengkap,
          niy: employee.niy,
          bidang: employee.bidangId ? unitName.get(employee.bidangId) : undefined,
          selesai: c.selesai,
          status: evaluation.status,
          daysRemaining: evaluation.daysRemaining ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    return rows.slice(0, args.limit ?? 10);
  },
});

export const pendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const [leave, resignations, employees] = await Promise.all([
      ctx.db.query("leaveRequests").collect(),
      ctx.db.query("resignations").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const byId = new Map(employees.map((e) => [e._id as string, e]));
    const name = (id: string) => byId.get(id)?.namaLengkap ?? "—";

    return {
      leave: leave
        .filter((l) => l.status === "PENDING")
        .map((l) => ({
          id: l._id,
          nomor: l.nomor,
          employee: name(l.employeeId),
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate,
          totalDays: l.totalDays,
          requestedAt: l.requestedAt,
        })),
      resignations: resignations
        .filter((r) => r.status === "PENDING" || r.status === "IN_CLEARANCE")
        .map((r) => ({
          id: r._id,
          nomor: r.nomor,
          employee: name(r.employeeId),
          type: r.type,
          lastWorkingDate: r.lastWorkingDate,
          status: r.status,
        })),
    };
  },
});

export const attendanceTrend = query({
  args: { period: v.optional(v.string()), bidangId: v.optional(v.id("organizationUnits")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const period = args.period ?? new Date().toISOString().slice(0, 7);
    const days = buildMonth(period);
    const dateSet = new Set(days.map((d) => d.date));
    const [records, employees] = await Promise.all([
      ctx.db.query("attendanceRecords").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const unitByEmployee = new Map(employees.map((e) => [e._id, e.bidangId]));
    const filtered = records.filter(
      (r) =>
        dateSet.has(r.date) &&
        (!args.bidangId || unitByEmployee.get(r.employeeId) === args.bidangId),
    );
    const sundayDates = new Set(days.filter((d) => d.isSunday).map((d) => d.date));
    return days
      .filter((d) => !sundayDates.has(d.date))
      .map((day) => {
        const dayRecords = filtered.filter((r) => r.date === day.date);
        const summary = summarizeAttendance(dayRecords);
        return {
          date: day.date,
          label: day.label,
          hadir: summary.hadir,
          izin: summary.izin,
          sakit: summary.sakit,
          alfa: summary.alfa,
          terlambat: summary.late,
        };
      });
  },
});

export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const logs = await ctx.db.query("auditLogs").order("desc").take(args.limit ?? 12);
    return logs.map((log) => ({
      id: log._id,
      action: log.action,
      entity: log.entity,
      summary: log.summary,
      actorName: log.actorName ?? "Sistem",
      createdAt: log.createdAt,
    }));
  },
});

export { DAY };
