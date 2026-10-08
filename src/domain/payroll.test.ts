import { describe, expect, it } from "vitest";

import { COMPONENT_CALCULATION, COMPONENT_KIND, computePayroll, type PayrollComponentInput } from "./payroll";

const BASE = 5_000_000;

const COMPONENTS: PayrollComponentInput[] = [
  { code: "TUNJ_TANGGUNGAN", name: "Tunjangan Tanggungan", kind: "EARNING", calculation: "PERCENTAGE_OF_BASE", value: 10 },
  { code: "TRANSPORT", name: "Uang Transport", kind: "EARNING", calculation: "FIXED", value: 150_000 },
  { code: "POT_BPJS", name: "Potongan BPJS", kind: "DEDUCTION", calculation: "PERCENTAGE_OF_COMPONENT", value: 5, basedOnCode: "TUNJ_TANGGUNGAN" },
];

describe("computePayroll", () => {
  it("evaluates fixed, percentage-of-base and percentage-of-component rules", () => {
    const result = computePayroll(BASE, COMPONENTS);
    const byCode = new Map(result.lines.map((line) => [line.code, line.amount]));

    expect(byCode.get("TUNJ_TANGGUNGAN")).toBe(500_000); // 10% of base
    expect(byCode.get("TRANSPORT")).toBe(150_000); // fixed
    expect(byCode.get("POT_BPJS")).toBe(25_000); // 5% of TUNJ_TANGGUNGAN
  });

  it("totals earnings, deductions and net pay", () => {
    const result = computePayroll(BASE, COMPONENTS);
    expect(result.baseSalary).toBe(BASE);
    expect(result.totalEarnings).toBe(650_000);
    expect(result.totalDeductions).toBe(25_000);
    expect(result.netPay).toBe(625_000);
  });

  it("tracks taxable earnings only for taxable earning lines", () => {
    const result = computePayroll(BASE, [
      ...COMPONENTS,
      { code: "NON_TAX", name: "Non-Taxable", kind: "EARNING", calculation: "FIXED", value: 100_000, taxable: false },
    ]);
    expect(result.totalTaxableIncome).toBe(650_000);
    expect(result.totalEarnings).toBe(750_000);
  });

  it("is safe against an invalid base salary", () => {
    const result = computePayroll(-1, COMPONENTS);
    expect(result.baseSalary).toBe(0);
    expect(result.netPay).toBe(150_000 - 0); // percentage-of-base lines collapse to 0
  });

  it("returns an empty computation without components", () => {
    const result = computePayroll(BASE, []);
    expect(result.lines).toHaveLength(0);
    expect(result.netPay).toBe(0);
  });

  it("exposes the configurable rule kinds", () => {
    expect(Object.values(COMPONENT_KIND)).toEqual(["EARNING", "DEDUCTION", "INFORMATIONAL"]);
    expect(Object.values(COMPONENT_CALCULATION)).toEqual([
      "FIXED",
      "PERCENTAGE_OF_BASE",
      "PERCENTAGE_OF_COMPONENT",
    ]);
  });
});
