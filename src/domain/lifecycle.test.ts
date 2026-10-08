import { describe, expect, it } from "vitest";

import { clearanceProgress, isDocumentExpired, maskSensitive } from "./lifecycle";
import { computePerformanceScore, performanceGrade } from "./development";

describe("clearanceProgress", () => {
  it("computes cleared count and percent", () => {
    const progress = clearanceProgress({
      clearances: [{ cleared: true }, { cleared: true }, { cleared: false }, { cleared: false }],
    });
    expect(progress).toEqual({ total: 4, cleared: 2, percent: 50 });
  });

  it("treats an empty checklist as complete", () => {
    expect(clearanceProgress({ clearances: [] })).toEqual({ total: 0, cleared: 0, percent: 100 });
  });
});

describe("isDocumentExpired", () => {
  it("is false without an expiry date", () => {
    expect(isDocumentExpired({ expiryDate: undefined }, new Date("2026-09-15T00:00:00"))).toBe(false);
  });

  it("is true once the expiry date has passed", () => {
    expect(isDocumentExpired({ expiryDate: "2026-09-01" }, new Date("2026-09-15T00:00:00"))).toBe(true);
    expect(isDocumentExpired({ expiryDate: "2026-09-15" }, new Date("2026-09-15T00:00:00"))).toBe(false);
  });
});

describe("maskSensitive", () => {
  it("masks all but the last characters", () => {
    expect(maskSensitive("3201234567890123", 4)).toBe("••••••••••••0123");
  });

  it("never reveals a short value", () => {
    expect(maskSensitive("123", 4)).toBe("•••");
  });

  it("uses a dash for missing values", () => {
    expect(maskSensitive(undefined)).toBe("—");
  });
});

describe("computePerformanceScore", () => {
  it("computes the weighted average", () => {
    expect(
      computePerformanceScore([
        { score: 90, weight: 60 },
        { score: 70, weight: 40 },
      ]),
    ).toBe(82);
  });

  it("ignores incomplete scores", () => {
    expect(
      computePerformanceScore([
        { score: 90, weight: 60 },
        { score: 10 }, // missing weight
        { weight: 40 }, // missing score
      ]),
    ).toBe(90);
  });

  it("returns null without any weighted score", () => {
    expect(computePerformanceScore([])).toBeNull();
  });
});

describe("performanceGrade", () => {
  it("maps scores into the grade bands", () => {
    expect(performanceGrade(95)).toBe("Sangat Baik");
    expect(performanceGrade(82)).toBe("Baik");
    expect(performanceGrade(75)).toBe("Cukup");
    expect(performanceGrade(50)).toBe("Perlu Pembinaan");
    expect(performanceGrade(null)).toBeNull();
  });
});
