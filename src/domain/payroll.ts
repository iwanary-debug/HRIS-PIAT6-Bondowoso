/**
 * Payroll calculation foundation.
 *
 * Deliberately rule-free: PIAT 6 payroll rules are not specified yet, so the
 * engine only evaluates an explicit, editable component list. No Indonesian
 * statutory rule (BPJS premiums, PPh 21, THR) is hard-coded — components carry
 * their own `type`, `calculation` and `value`, configured in Pengaturan.
 */

export const COMPONENT_KIND = {
  EARNING: "EARNING",
  DEDUCTION: "DEDUCTION",
  INFORMATIONAL: "INFORMATIONAL",
} as const;
export type ComponentKind = (typeof COMPONENT_KIND)[keyof typeof COMPONENT_KIND];

export const COMPONENT_CALCULATION = {
  /** Fixed amount stored on the component assignment. */
  FIXED: "FIXED",
  /** value * base amount (base = baseSalary or a component marked as base). */
  PERCENTAGE_OF_BASE: "PERCENTAGE_OF_BASE",
  /** value * total of other components (percentage of another component). */
  PERCENTAGE_OF_COMPONENT: "PERCENTAGE_OF_COMPONENT",
} as const;
export type ComponentCalculation =
  (typeof COMPONENT_CALCULATION)[keyof typeof COMPONENT_CALCULATION];

export interface PayrollComponent {
  _id: string;
  code: string;
  name: string;
  kind: ComponentKind;
  calculation: ComponentCalculation;
  /** Amount (FIXED) or percentage points (PERCENTAGE_*). */
  value: number;
  /** For PERCENTAGE_OF_COMPONENT: which component's amount is the base. */
  basedOnCode?: string;
  taxable: boolean;
  active: boolean;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PayrollComponentInput {
  code: string;
  name: string;
  kind: ComponentKind;
  calculation: ComponentCalculation;
  value: number;
  basedOnCode?: string;
  taxable?: boolean;
}

export interface PayrollLine {
  code: string;
  name: string;
  kind: ComponentKind;
  calculation: ComponentCalculation;
  rate?: number;
  amount: number;
  taxable: boolean;
}

export interface PayrollComputation {
  baseSalary: number;
  lines: PayrollLine[];
  totalEarnings: number;
  totalDeductions: number;
  /** totalEarnings - totalDeductions. */
  netPay: number;
  totalTaxableIncome: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Evaluate components in declaration order. `PERCENTAGE_OF_COMPONENT` resolves
 * against an already-computed line, so ordering matters and is preserved from
 * the component configuration.
 */
export function computePayroll(
  baseSalary: number,
  components: readonly PayrollComponentInput[],
): PayrollComputation {
  const lines: PayrollLine[] = [];
  const resolved = new Map<string, number>();
  const safeBase = Number.isFinite(baseSalary) && baseSalary > 0 ? baseSalary : 0;

  for (const component of components) {
    const rate = component.value;
    let amount = 0;
    switch (component.calculation) {
      case "FIXED":
        amount = rate;
        break;
      case "PERCENTAGE_OF_BASE":
        amount = (safeBase * rate) / 100;
        break;
      case "PERCENTAGE_OF_COMPONENT": {
        const baseAmount = component.basedOnCode ? resolved.get(component.basedOnCode) : undefined;
        amount = ((baseAmount ?? 0) * rate) / 100;
        break;
      }
      default:
        amount = 0;
    }
    const finalAmount = round(amount);
    resolved.set(component.code, finalAmount);
    lines.push({
      code: component.code,
      name: component.name,
      kind: component.kind,
      calculation: component.calculation,
      rate: component.calculation === "FIXED" ? undefined : rate,
      amount: finalAmount,
      taxable: component.taxable ?? component.kind === "EARNING",
    });
  }

  const totalEarnings = round(
    lines.filter((line) => line.kind === "EARNING").reduce((sum, line) => sum + line.amount, 0),
  );
  const totalDeductions = round(
    lines.filter((line) => line.kind === "DEDUCTION").reduce((sum, line) => sum + line.amount, 0),
  );
  const totalTaxableIncome = round(
    lines.filter((line) => line.taxable && line.kind === "EARNING").reduce((s, l) => s + l.amount, 0),
  );

  return {
    baseSalary: safeBase,
    lines,
    totalEarnings,
    totalDeductions,
    netPay: round(totalEarnings - totalDeductions),
    totalTaxableIncome,
  };
}

export const PAYROLL_PERIOD_STATUS = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;
export type PayrollPeriodStatus =
  (typeof PAYROLL_PERIOD_STATUS)[keyof typeof PAYROLL_PERIOD_STATUS];

export const PAYROLL_PERIOD_STATUS_LABELS: Record<PayrollPeriodStatus, string> = {
  DRAFT: "Draf",
  APPROVED: "Disetujui",
  PAID: "Dibayar",
  CANCELLED: "Dibatalkan",
};
