/**
 * Leave & permission workflow.
 * Request -> Review -> Approval -> Approved / Rejected, with full history.
 */

export const LEAVE_TYPE = {
  CUTI: "CUTI",
  IZIN: "IZIN",
  SAKIT: "SAKIT",
  CUTI_BESAR: "CUTI_BESAR",
  IZIN_HAJJAH: "IZIN_HAJJAH",
  PEMULA: "PEMULA",
  MENIKAH: "MENIKAH",
  KELUARGA: "KELUARGA",
  LAINNYA: "LAINNYA",
} as const;
export type LeaveType = (typeof LEAVE_TYPE)[keyof typeof LEAVE_TYPE];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  CUTI: "Cuti Tahunan",
  IZIN: "Izin",
  SAKIT: "Sakit",
  CUTI_BESAR: "Cuti Besar",
  IZIN_HAJJAH: "Izin Hajjah",
  PEMULA: "Izin Premi",
  MENIKAH: "Izin Menikah",
  KELUARGA: "Izin Keluarga",
  LAINNYA: "Lainnya",
};

export const LEAVE_REQUEST_STATUS = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type LeaveRequestStatus =
  (typeof LEAVE_REQUEST_STATUS)[keyof typeof LEAVE_REQUEST_STATUS];

export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  DRAFT: "Draf",
  PENDING: "Menunggu Persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

export const LEAVE_TRANSITION: Record<LeaveRequestStatus, LeaveRequestStatus[]> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["CANCELLED"],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(from: LeaveRequestStatus, to: LeaveRequestStatus): boolean {
  return LEAVE_TRANSITION[from]?.includes(to) ?? false;
}

export interface LeaveRequest {
  _id: string;
  employeeId: string;
  nomor: string;
  type: LeaveType;
  /** yyyy-mm-dd */
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  attachmentDocumentId?: string;
  status: LeaveRequestStatus;
  requestedBy: string;
  requestedAt: number;
  decidedBy?: string;
  decidedAt?: number;
  decisionNote?: string;
}

export interface LeaveHistoryEntry {
  _id: string;
  leaveRequestId: string;
  fromStatus?: LeaveRequestStatus;
  toStatus: LeaveRequestStatus;
  actorId: string;
  note?: string;
  createdAt: number;
}

export interface LeaveBalance {
  _id: string;
  employeeId: string;
  year: number;
  type: LeaveType;
  entitled: number;
  used: number;
  remaining: number;
  notes?: string;
}

export function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return diff < 0 ? 0 : diff + 1;
}

export function remainingDays(balance: LeaveBalance): number {
  return Math.max(0, balance.entitled - balance.used);
}

/** Inclusive list of dates covered by a request, used for attendance sync. */
export function leaveDateRange(startDate: string, endDate: string): string[] {
  const days = calculateLeaveDays(startDate, endDate);
  const out: string[] = [];
  const start = new Date(`${startDate}T00:00:00`);
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start.getTime());
    date.setDate(date.getDate() + index);
    out.push(date.toISOString().slice(0, 10));
  }
  return out;
}
