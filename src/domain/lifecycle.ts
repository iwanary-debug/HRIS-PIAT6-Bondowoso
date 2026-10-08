/**
 * Employee lifecycle domain — documents, mutations/promotions and
 * resignation/termination. Employee records are never deleted on exit; the
 * status changes and the history remains.
 */

export const DOCUMENT_CATEGORY = {
  KTP: "KTP",
  KK: "KK",
  IJAZAH: "IJAZAH",
  SERTIFIKAT: "SERTIFIKAT",
  SK: "SK",
  KONTRAK: "KONTRAK",
  PASPOR: "PASPOR",
  LAINNYA: "LAINNYA",
} as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORY)[keyof typeof DOCUMENT_CATEGORY];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  KTP: "KTP",
  KK: "Kartu Keluarga",
  IJAZAH: "Ijazah",
  SERTIFIKAT: "Sertifikat",
  SK: "SK Penetapan",
  KONTRAK: "Dokumen Kontrak",
  PASPOR: "Paspor",
  LAINNYA: "Dokumen Lainnya",
};

export const DOCUMENT_STATUS = {
  VERIFIED: "VERIFIED",
  PENDING: "PENDING",
  EXPIRED: "EXPIRED",
  REJECTED: "REJECTED",
} as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

export interface EmployeeDocument {
  _id: string;
  employeeId: string;
  category: DocumentCategory;
  name: string;
  /** Storage key from the storage abstraction — never a raw file in Git. */
  storageKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  version: number;
  status: DocumentStatus;
  issuedDate?: string;
  expiryDate?: string;
  notes?: string;
  uploadedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export function isDocumentExpired(
  document: Pick<EmployeeDocument, "expiryDate">,
  reference: Date = new Date(),
): boolean {
  if (!document.expiryDate) return false;
  return document.expiryDate < reference.toISOString().slice(0, 10);
}

export const MUTATION_TYPE = {
  MUTASI: "MUTASI",
  PROMOSI: "PROMOSI",
  DEMOSI: "DEMOSI",
  ROTASI: "ROTASI",
  KENAIKAN_GAJI: "KENAIKAN_GAJI",
} as const;
export type MutationType = (typeof MUTATION_TYPE)[keyof typeof MUTATION_TYPE];

export const MUTATION_TYPE_LABELS: Record<MutationType, string> = {
  MUTASI: "Mutasi",
  PROMOSI: "Promosi",
  DEMOSI: "Demosi",
  ROTASI: "Rotasi",
  KENAIKAN_GAJI: "Kenaikan Gaji",
};

export interface MutationRecord {
  _id: string;
  employeeId: string;
  type: MutationType;
  effectiveDate: string;
  fromPositionId?: string;
  fromPositionName?: string;
  toPositionId?: string;
  toPositionName?: string;
  fromUnitId?: string;
  toUnitId?: string;
  fromUnitName?: string;
  toUnitName?: string;
  /** Reference to the signed SK document. */
  skDocumentId?: string;
  skNumber?: string;
  notes?: string;
  createdBy?: string;
  createdAt: number;
}

export const RESIGNATION_TYPE = {
  RESIGN: "RESIGN",
  TERMINASI: "TERMINASI",
  PENSIUN: "PENSIUN",
  PENGANGKATAN: "PENGANGKATAN",
} as const;
export type ResignationType = (typeof RESIGNATION_TYPE)[keyof typeof RESIGNATION_TYPE];

export const RESIGNATION_TYPE_LABELS: Record<ResignationType, string> = {
  RESIGN: "Resign",
  TERMINASI: "Terminasi",
  PENSIUN: "Pensiun",
  PENGANGKATAN: "Pengangkatan",
};

export const RESIGNATION_STATUS = {
  PENDING: "PENDING",
  IN_CLEARANCE: "IN_CLEARANCE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type ResignationStatus =
  (typeof RESIGNATION_STATUS)[keyof typeof RESIGNATION_STATUS];

export const RESIGNATION_STATUS_LABELS: Record<ResignationStatus, string> = {
  PENDING: "Diajukan",
  IN_CLEARANCE: "Proses Clearance",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

export const CLEARANCE_ITEM = {
  ATASAN_LANGSUNG: "ATASAN_LANGSUNG",
  KEUANGAN: "KEUANGAN",
  SARPRAS: "SARPRAS",
  PERPUSTAKAAN: "PERPUSTAKAAN",
  UKS: "UKS",
  DOKUMEN: "DOKUMEN",
} as const;
export type ClearanceItem = (typeof CLEARANCE_ITEM)[keyof typeof CLEARANCE_ITEM];

export const CLEARANCE_ITEM_LABELS: Record<ClearanceItem, string> = {
  ATASAN_LANGSUNG: "Atasan Langsung",
  KEUANGAN: "Keuangan",
  SARPRAS: "Sarana & Prasarana",
  PERPUSTAKAAN: "Perpustakaan",
  UKS: "UKS",
  DOKUMEN: "Dokumen Karyawan",
};

export interface Clearance {
  item: ClearanceItem;
  label: string;
  cleared: boolean;
  clearedBy?: string;
  clearedAt?: number;
  notes?: string;
}

export interface ResignationRecord {
  _id: string;
  employeeId: string;
  nomor: string;
  type: ResignationType;
  lastWorkingDate: string;
  reason: string;
  status: ResignationStatus;
  clearances: Clearance[];
  documentId?: string;
  notes?: string;
  requestedBy?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export function clearanceProgress(record: {
  clearances: readonly { cleared: boolean }[];
}): {
  total: number;
  cleared: number;
  percent: number;
} {
  const total = record.clearances.length;
  const cleared = record.clearances.filter((item) => item.cleared).length;
  return { total, cleared, percent: total === 0 ? 100 : Math.round((cleared / total) * 100) };
}

export const BENEFIT_TYPE = {
  BPJS_KESEHATAN: "BPJS_KESEHATAN",
  BPJS_KETENAGAKERJAAN: "BPJS_KETENAGAKERJAAN",
  TUNJANGAN: "TUNJANGAN",
  ASURANSI: "ASURANSI",
  LAINNYA: "LAINNYA",
} as const;
export type BenefitType = (typeof BENEFIT_TYPE)[keyof typeof BENEFIT_TYPE];

export const BENEFIT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  PENDING: "PENDING",
} as const;
export type BenefitStatus = (typeof BENEFIT_STATUS)[keyof typeof BENEFIT_STATUS];

export interface BenefitRecord {
  _id: string;
  employeeId: string;
  type: BenefitType;
  provider?: string;
  /** Sensitive membership number — masked without HR_SENSITIVE_VIEW. */
  number?: string;
  status: BenefitStatus;
  startDate?: string;
  endDate?: string;
  monthlyContribution?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export function maskSensitive(value: string | undefined, keep = 4): string {
  if (!value) return "—";
  if (value.length <= keep) return "•".repeat(value.length);
  return `${"•".repeat(Math.max(3, value.length - keep))}${value.slice(-keep)}`;
}
