/**
 * Derived-value helpers. Pure functions, no I/O — unit tested directly.
 * Everything here works on ISO `yyyy-mm-dd` date strings or `Date`/`number`.
 */

export function toISODate(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidISODate(value: string | undefined | null): boolean {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && toISODate(date) === value;
}

function diffInDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** Usia in whole years, computed from date of birth. */
export function calculateAge(
  birthDate: string | Date | undefined,
  reference: Date = new Date(),
): number | undefined {
  if (!birthDate) return undefined;
  const birth = typeof birthDate === "string" ? new Date(`${birthDate}T00:00:00`) : birthDate;
  if (Number.isNaN(birth.getTime())) return undefined;
  let age = reference.getFullYear() - birth.getFullYear();
  const monthDelta = reference.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getDate() < birth.getDate())) age -= 1;
  return age < 0 ? undefined : age;
}

export interface Tenure {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  totalDays: number;
  label: string;
}

/**
 * Masa kerja computed from join date. Returns undefined when the join date is
 * missing or in the future, rather than trusting a spreadsheet cell.
 */
export function calculateTenure(
  joinDate: string | Date | undefined,
  reference: Date = new Date(),
): Tenure | undefined {
  if (!joinDate) return undefined;
  const start =
    typeof joinDate === "string" ? new Date(`${joinDate}T00:00:00`) : new Date(joinDate);
  if (Number.isNaN(start.getTime())) return undefined;

  const from =
    start.getFullYear() > reference.getFullYear() ||
    (start.getFullYear() === reference.getFullYear() && start.getMonth() > reference.getMonth()) ||
    (start.getFullYear() === reference.getFullYear() &&
      start.getMonth() === reference.getMonth() &&
      start.getDate() > reference.getDate())
      ? undefined
      : start;
  if (!from) return undefined;

  let years = reference.getFullYear() - from.getFullYear();
  let months = reference.getMonth() - from.getMonth();
  let days = reference.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(reference.getFullYear(), reference.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalMonths = years * 12 + months;
  const totalDays = Math.max(0, diffInDays(from, reference));
  return {
    years,
    months,
    days,
    totalMonths,
    totalDays,
    label: `${years} Th ${months} Bln ${days} Hr`,
  };
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function daysBetween(from: Date, to: Date): number {
  return diffInDays(from, to);
}
