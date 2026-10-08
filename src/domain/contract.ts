/**
 * Contract & employment domain.
 *
 * Contract status is derived from the contract end date with configurable
 * thresholds — no payroll/legal rules are hard-coded.
 */

import { daysBetween } from "./tenure";

export const CONTRACT_STATUS = {
  /** No contract or no end date. */
  AMAN: "AMAN",
  /** Ends in more than `perluTindakanHari` days. */
  MENDEKAT: "MENDEKAT",
  /** Ends within `perluTindakanHari` days (inclusive). */
  PERLU_TINDAKAN: "PERLU_TINDAKAN",
  /** Already past the end date. */
  LEWAT: "LEWAT",
} as const;
export type ContractStatus = (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  AMAN: "Aman",
  MENDEKAT: "Mendekati Jatuh Tempo",
  PERLU_TINDAKAN: "Perlu Tindakan",
  LEWAT: "Sudah Lewat",
};

/** Thresholds in days. Override per institution in `settings`. */
export const DEFAULT_CONTRACT_THRESHOLDS = {
  mendekatiHari: 90,
  perluTindakanHari: 30,
} as const;

export const CONTRACT_TYPE = {
  PKWT: "PKWT",
  PKWTT: "PKWTT",
  TETAP: "TETAP",
} as const;
export type ContractType = (typeof CONTRACT_TYPE)[keyof typeof CONTRACT_TYPE];

export interface Contract {
  _id: string;
  employeeId: string;
  nomor: string;
  type: ContractType;
  mulai: string;
  /** Empty for PKWTT / permanent contracts. */
  selesai?: string;
  /** Free text, e.g. "1 Tahun", "6 Bulan". */
  durasi?: string;
  status: "AKTIF" | "SELESAI" | "DIBATALKAN";
  /** Document reference (see documents domain). */
  skDocumentId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContractStatusResult {
  status: ContractStatus;
  daysRemaining: number | null;
  label: string;
}

/**
 * Contract health for the "Kontrak Akan Berakhir" dashboard.
 * `endDate` empty (PKWTT / permanent) is always AMAN.
 */
export function evaluateContractStatus(
  endDate: string | undefined,
  reference: Date = new Date(),
  thresholds: { mendekatiHari: number; perluTindakanHari: number } = DEFAULT_CONTRACT_THRESHOLDS,
): ContractStatusResult {
  if (!endDate) {
    return { status: "AMAN", daysRemaining: null, label: CONTRACT_STATUS_LABELS.AMAN };
  }
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) {
    return { status: "AMAN", daysRemaining: null, label: CONTRACT_STATUS_LABELS.AMAN };
  }
  const days = daysBetween(reference, end);
  let status: ContractStatus;
  if (days < 0) status = "LEWAT";
  else if (days <= thresholds.perluTindakanHari) status = "PERLU_TINDAKAN";
  else if (days <= thresholds.mendekatiHari) status = "MENDEKAT";
  else status = "AMAN";
  return { status, daysRemaining: days, label: CONTRACT_STATUS_LABELS[status] };
}

/** Parse "1 Tahun" / "6 bulan" / "730 hari" into a day count. */
export function parseContractDurationToDays(duration: string | undefined): number | null {
  if (!duration) return null;
  const text = duration.trim().toLowerCase();
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(tahun|thn|th|bulan|bln|bl|hari|day|hr)?/);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  if (Number.isNaN(value)) return null;
  const unit = match[2];
  if (!unit) return Math.round(value);
  if (unit.startsWith("tahun") || unit === "thn" || unit === "th") return Math.round(value * 365);
  if (unit.startsWith("bulan") || unit === "bln" || unit === "bl") return Math.round(value * 30);
  return Math.round(value);
}
