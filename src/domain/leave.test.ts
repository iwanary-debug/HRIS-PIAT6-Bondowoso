import { describe, expect, it } from "vitest";

import {
  canTransition,
  calculateLeaveDays,
  leaveDateRange,
  remainingDays,
  type LeaveBalance,
} from "./leave";

describe("canTransition", () => {
  it("allows the documented workflow edges", () => {
    expect(canTransition("DRAFT", "PENDING")).toBe(true);
    expect(canTransition("PENDING", "APPROVED")).toBe(true);
    expect(canTransition("PENDING", "REJECTED")).toBe(true);
    expect(canTransition("APPROVED", "CANCELLED")).toBe(true);
  });

  it("blocks illegal edges", () => {
    expect(canTransition("REJECTED", "PENDING")).toBe(false);
    expect(canTransition("CANCELLED", "APPROVED")).toBe(false);
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
  });
});

describe("calculateLeaveDays", () => {
  it("counts start and end inclusively", () => {
    expect(calculateLeaveDays("2026-01-01", "2026-01-05")).toBe(5);
    expect(calculateLeaveDays("2026-03-10", "2026-03-10")).toBe(1);
  });

  it("returns 0 for inverted or invalid ranges", () => {
    expect(calculateLeaveDays("2026-01-05", "2026-01-01")).toBe(0);
    expect(calculateLeaveDays("bukan-tanggal", "2026-01-01")).toBe(0);
  });
});

describe("leaveDateRange", () => {
  it("expands a request into every covered date", () => {
    expect(leaveDateRange("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });
});

describe("remainingDays", () => {
  it("never goes below zero", () => {
    const balance: LeaveBalance = {
      _id: "b1",
      employeeId: "e1",
      year: 2026,
      type: "CUTI",
      entitled: 12,
      used: 5,
      remaining: 7,
    };
    expect(remainingDays(balance)).toBe(7);

    const exhausted: LeaveBalance = { ...balance, used: 20, remaining: 0 };
    expect(remainingDays(exhausted)).toBe(0);
  });
});
