import { describe, expect, it } from "vitest";

import { buildMonth, calculateOvertime, isLate, summarizeAttendance } from "./attendance";

describe("isLate", () => {
  it("returns late minutes only beyond the tolerance", () => {
    expect(isLate("07:20", "07:00", 15)).toBe(20);
    expect(isLate("07:10", "07:00", 15)).toBe(0);
    expect(isLate("06:55", "07:00", 15)).toBe(0);
  });

  it("returns 0 when there is no check-in", () => {
    expect(isLate(undefined, "07:00", 15)).toBe(0);
  });
});

describe("calculateOvertime", () => {
  it("counts minutes beyond work end above the threshold", () => {
    expect(calculateOvertime("15:30", "15:00")).toBe(30);
    expect(calculateOvertime("15:10", "15:00")).toBe(0);
    expect(calculateOvertime(undefined, "15:00")).toBe(0);
  });
});

describe("buildMonth", () => {
  it("builds every day of the month with the right date strings", () => {
    const days = buildMonth("2026-09");
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ date: "2026-09-01", dayOfWeek: 2, isSunday: false });
    expect(days[5]).toMatchObject({ date: "2026-09-06", isSunday: true });
  });

  it("handles short months", () => {
    expect(buildMonth("2026-02")).toHaveLength(28);
  });
});

describe("summarizeAttendance", () => {
  it("buckets records by status and counts lateness", () => {
    const summary = summarizeAttendance([
      { status: "HADIR", lateMinutes: 10, checkIn: "07:15", checkOut: "15:05" },
      { status: "HADIR", lateMinutes: 0, checkIn: "06:50", checkOut: "15:00" },
      { status: "ALFA" },
      { status: "SAKIT" },
    ]);
    expect(summary).toMatchObject({ hadir: 2, alfa: 1, sakit: 1, late: 1 });
    expect(summary.attendanceRate).toBeGreaterThanOrEqual(0);
    expect(summary.attendanceRate).toBeLessThanOrEqual(100);
  });

  it("returns a zeroed summary without records", () => {
    const summary = summarizeAttendance([]);
    expect(summary.hadir).toBe(0);
    expect(summary.totalDays).toBe(0);
  });
});
