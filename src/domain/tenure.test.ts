import { describe, expect, it } from "vitest";

import { calculateAge, calculateTenure, daysBetween, isValidISODate, toISODate } from "./tenure";

const REF = new Date("2026-09-15T00:00:00");

describe("toISODate", () => {
  it("formats a Date as yyyy-mm-dd", () => {
    expect(toISODate(new Date(2026, 8, 5))).toBe("2026-09-05");
  });

  it("returns empty for invalid input", () => {
    expect(toISODate("not-a-date")).toBe("");
  });
});

describe("isValidISODate", () => {
  it("accepts real calendar dates", () => {
    expect(isValidISODate("2026-02-28")).toBe(true);
  });

  it("rejects impossible dates and wrong shapes", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("15/09/2026")).toBe(false);
    expect(isValidISODate(undefined)).toBe(false);
  });
});

describe("calculateAge", () => {
  it("computes whole years from the birth date", () => {
    expect(calculateAge("1990-05-17", REF)).toBe(36);
  });

  it("does not count an uncelebrated birthday", () => {
    expect(calculateAge("1990-12-01", REF)).toBe(35);
  });

  it("returns undefined for future or missing birth dates", () => {
    expect(calculateAge("2030-01-01", REF)).toBeUndefined();
    expect(calculateAge(undefined, REF)).toBeUndefined();
  });
});

describe("calculateTenure", () => {
  it("computes years, months and days from the join date", () => {
    const tenure = calculateTenure("2024-03-10", REF);
    expect(tenure).toMatchObject({ years: 2, months: 6, days: 5, totalMonths: 30 });
    expect(tenure?.label).toBe("2 Th 6 Bln 5 Hr");
  });

  it("borrows days from the previous month when needed", () => {
    const tenure = calculateTenure("2026-08-31", new Date("2026-09-01T00:00:00"));
    expect(tenure).toMatchObject({ years: 0, months: 0, days: 1 });
  });

  it("returns undefined for future or missing join dates", () => {
    expect(calculateTenure("2027-01-01", REF)).toBeUndefined();
    expect(calculateTenure(undefined, REF)).toBeUndefined();
  });
});

describe("daysBetween", () => {
  it("counts whole days between two dates", () => {
    expect(daysBetween(new Date("2026-09-15T00:00:00"), new Date("2026-09-25T00:00:00"))).toBe(10);
  });
});
