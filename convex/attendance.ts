/**
 * Attendance module.
 * Capture is device-agnostic: `source` + `deviceId` keep fingerprint / RFID /
 * QR / mobile integrations open without changing the data model.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import {
  ATTENDANCE_SOURCE,
  calculateOvertime,
  isLate,
  summarizeAttendance,
} from "../src/domain/attendance";
import { requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, positionName, unitName } from "./lib/names";

const settingsFor = async (ctx: Parameters<typeof requireUser>[0], key: string) => {
  const row = await ctx.db
    .query("settings")
    .withIndex("key", (q) => q.eq("key", key))
    .unique();
  return row?.value as { workStart: string; workEnd: string; lateThreshold: number } | undefined;
};

export const workSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return (await settingsFor(ctx, "attendance")) ?? {
      workStart: "07:00",
      workEnd: "15:00",
      lateThreshold: 15,
    };
  },
});

export const setWorkSettings = mutation({
  args: { workStart: v.string(), workEnd: v.string(), lateThreshold: v.number() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    const value = {
      workStart: args.workStart,
      workEnd: args.workEnd,
      lateThreshold: args.lateThreshold,
    };
    const existing = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "attendance"))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { value, updatedAt: Date.now(), updatedBy: user.id });
    else
      await ctx.db.insert("settings", {
        key: "attendance",
        value,
        updatedAt: Date.now(),
        updatedBy: user.id,
      });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "settings",
      summary: `Jam kerja diubah: ${args.workStart}–${args.workEnd}, toleransi ${args.lateThreshold} menit`,
    });
    return { ok: true as const };
  },
});

export const list = query({
  args: {
    period: v.optional(v.string()),
    date: v.optional(v.string()),
    employeeId: v.optional(v.id("employees")),
    bidangId: v.optional(v.id("organizationUnits")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const period = args.period ?? new Date().toISOString().slice(0, 7);
    let records = await ctx.db.query("attendanceRecords").collect();
    if (args.date) records = records.filter((r) => r.date === args.date);
    else records = records.filter((r) => r.date.startsWith(period));
    if (args.employeeId) records = records.filter((r) => r.employeeId === args.employeeId);
    if (args.status) records = records.filter((r) => r.status === args.status);

    const employees = await ctx.db.query("employees").collect();
    const maps = await loadNameMaps(ctx);
    const employeeById = new Map(employees.map((e) => [e._id, e]));
    if (args.bidangId) {
      records = records.filter((r) => employeeById.get(r.employeeId)?.bidangId === args.bidangId);
    }

    return records
      .sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId))
      .map((record) => {
        const employee = employeeById.get(record.employeeId);
        return {
          id: record._id,
          employeeId: record.employeeId,
          namaLengkap: employee?.namaLengkap ?? "—",
          niy: employee?.niy ?? "—",
          bidang: unitName(maps, employee?.bidangId),
          date: record.date,
          status: record.status,
          checkIn: record.checkIn,
          checkOut: record.checkOut,
          lateMinutes: record.lateMinutes,
          overtimeMinutes: record.overtimeMinutes,
          source: record.source,
          notes: record.notes,
        };
      });
  },
});

/** Daily board: which employees have no record yet for a given date. */
export const dailyBoard = query({
  args: { date: v.string(), bidangId: v.optional(v.id("organizationUnits")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const employees = await ctx.db.query("employees").collect();
    const maps = await loadNameMaps(ctx);
    const records = await ctx.db
      .query("attendanceRecords")
      .withIndex("date", (q) => q.eq("date", args.date))
      .collect();
    const byEmployee = new Map(records.map((r) => [r.employeeId, r]));

    return employees
      .filter((e) => e.status === "AKTIF")
      .filter((e) => (args.bidangId ? e.bidangId === args.bidangId : true))
      .map((employee) => {
        const record = byEmployee.get(employee._id);
        return {
          employeeId: employee._id,
          namaLengkap: employee.namaLengkap,
          niy: employee.niy,
          jabatan: positionName(maps, employee.jabatanId),
          bidang: unitName(maps, employee.bidangId),
          recorded: !!record,
          status: record?.status ?? null,
          checkIn: record?.checkIn,
          checkOut: record?.checkOut,
          lateMinutes: record?.lateMinutes,
        };
      })
      .sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap, "id"));
  },
});

/** Upsert one attendance record; recomputes lateness and overtime. */
export const record = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
    status: v.string(),
    checkIn: v.optional(v.union(v.string(), v.null())),
    checkOut: v.optional(v.union(v.string(), v.null())),
    source: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_ATTENDANCE_EDIT);
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("FORMAT_TANGGAL_INVALID");

    const settings = (await settingsFor(ctx, "attendance")) ?? {
      workStart: "07:00",
      workEnd: "15:00",
      lateThreshold: 15,
    };
    const now = Date.now();
    const lateMinutes =
      args.status === "HADIR" ? isLate(args.checkIn ?? undefined, settings.workStart, settings.lateThreshold) : 0;
    const overtimeMinutes =
      args.status === "HADIR"
        ? calculateOvertime(args.checkOut ?? undefined, settings.workEnd, settings.lateThreshold)
        : 0;

    const existing = await ctx.db
      .query("attendanceRecords")
      .withIndex("employeeId_date", (q) =>
        q.eq("employeeId", args.employeeId).eq("date", args.date),
      )
      .unique();

    const payload = {
      employeeId: args.employeeId,
      date: args.date,
      status: args.status,
      checkIn: args.checkIn ?? undefined,
      checkOut: args.checkOut ?? undefined,
      lateMinutes,
      overtimeMinutes,
      source: args.source ?? ATTENDANCE_SOURCE.MANUAL,
      deviceId: args.deviceId ?? undefined,
      notes: args.notes ?? undefined,
      recordedBy: user.id,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { id: existing._id, lateMinutes, overtimeMinutes };
    }
    const id = await ctx.db.insert("attendanceRecords", { ...payload, createdAt: now });
    return { id, lateMinutes, overtimeMinutes };
  },
});

/** Bulk record from the daily board or an external device. */
export const recordBulk = mutation({
  args: {
    date: v.string(),
    entries: v.array(
      v.object({
        employeeId: v.id("employees"),
        status: v.string(),
        checkIn: v.optional(v.union(v.string(), v.null())),
        checkOut: v.optional(v.union(v.string(), v.null())),
        notes: v.optional(v.string()),
      }),
    ),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_ATTENDANCE_EDIT);
    const settings = (await settingsFor(ctx, "attendance")) ?? {
      workStart: "07:00",
      workEnd: "15:00",
      lateThreshold: 15,
    };
    const now = Date.now();
    let upserted = 0;

    for (const entry of args.entries) {
      const lateMinutes =
        entry.status === "HADIR"
          ? isLate(entry.checkIn ?? undefined, settings.workStart, settings.lateThreshold)
          : 0;
      const overtimeMinutes =
        entry.status === "HADIR"
          ? calculateOvertime(entry.checkOut ?? undefined, settings.workEnd, settings.lateThreshold)
          : 0;
      const existing = await ctx.db
        .query("attendanceRecords")
        .withIndex("employeeId_date", (q) =>
          q.eq("employeeId", entry.employeeId).eq("date", args.date),
        )
        .unique();
      const payload = {
        employeeId: entry.employeeId,
        date: args.date,
        status: entry.status,
        checkIn: entry.checkIn ?? undefined,
        checkOut: entry.checkOut ?? undefined,
        lateMinutes,
        overtimeMinutes,
        source: args.source ?? ATTENDANCE_SOURCE.MANUAL,
        notes: entry.notes ?? undefined,
        recordedBy: user.id,
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("attendanceRecords", { ...payload, createdAt: now });
      upserted += 1;
    }

    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "attendance",
      summary: `Pencatatan kehadiran massal ${args.date}: ${upserted} data`,
      metadata: { tanggal: args.date, jumlah: upserted, sumber: args.source ?? "MANUAL" },
    });
    return { upserted };
  },
});

export const summaryByEmployee = query({
  args: { period: v.optional(v.string()), bidangId: v.optional(v.id("organizationUnits")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const period = args.period ?? new Date().toISOString().slice(0, 7);
    const [records, employees] = await Promise.all([
      ctx.db.query("attendanceRecords").collect(),
      ctx.db.query("employees").collect(),
    ]);
    const maps = await loadNameMaps(ctx);
    const scoped = employees.filter(
      (e) => e.status === "AKTIF" && (!args.bidangId || e.bidangId === args.bidangId),
    );

    return scoped
      .map((employee) => {
        const own = records.filter(
          (r) => r.employeeId === employee._id && r.date.startsWith(period),
        );
        const summary = summarizeAttendance(own, { totalDays: 22 });
        return {
          employeeId: employee._id,
          namaLengkap: employee.namaLengkap,
          niy: employee.niy,
          jabatan: positionName(maps, employee.jabatanId),
          bidang: unitName(maps, employee.bidangId),
          ...summary,
        };
      })
      .sort((a, b) => a.attendanceRate - b.attendanceRate);
  },
});
