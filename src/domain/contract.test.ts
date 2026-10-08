import { describe, expect, it } from "vitest";

import { CONTRACT_TYPE, evaluateContractStatus, parseContractDurationToDays } from "./contract";

const REF = new Date("2026-09-15T00:00:00");

describe("evaluateContractStatus", () => {
  it("treats PKWTT (no end date) as always AMAN", () => {
    expect(evaluateContractStatus(undefined, REF)).toMatchObject({
      status: "AMAN",
      daysRemaining: null,
    });
  });

  it("flags contracts past their end date as LEWAT", () => {
    expect(evaluateContractStatus("2026-09-10", REF)).toMatchObject({
      status: "LEWAT",
      daysRemaining: -5,
    });
  });

  it("flags contracts within 30 days as PERLU_TINDAKAN", () => {
    expect(evaluateContractStatus("2026-10-01", REF).status).toBe("PERLU_TINDAKAN");
  });

  it("flags contracts within 90 days as MENDEKAT", () => {
    expect(evaluateContractStatus("2026-11-15", REF).status).toBe("MENDEKAT");
  });

  it("leaves distant contracts AMAN", () => {
    expect(evaluateContractStatus("2027-09-15", REF).status).toBe("AMAN");
  });

  it("supports custom thresholds", () => {
    const result = evaluateContractStatus("2026-10-10", REF, { mendekatiHari: 60, perluTindakanHari: 10 });
    expect(result.status).toBe("MENDEKAT");
  });
});

describe("parseContractDurationToDays", () => {
  it("parses Indonesian durations", () => {
    expect(parseContractDurationToDays("1 Tahun")).toBe(365);
    expect(parseContractDurationToDays("6 bulan")).toBe(180);
    expect(parseContractDurationToDays("30 hari")).toBe(30);
  });

  it("treats a bare number as days", () => {
    expect(parseContractDurationToDays("730")).toBe(730);
  });

  it("returns null for missing or unparseable input", () => {
    expect(parseContractDurationToDays(undefined)).toBeNull();
    expect(parseContractDurationToDays("n/a")).toBeNull();
  });
});

describe("CONTRACT_TYPE", () => {
  it("keeps the two employment contracts of the spec", () => {
    expect(Object.values(CONTRACT_TYPE)).toContain("PKWT");
    expect(Object.values(CONTRACT_TYPE)).toContain("PKWTT");
  });
});
