/**
 * Attendance domain.
 *
 * Capture is device-agnostic: a record may come from MANUAL entry, a browser
 * check-in, or an external device (fingerprint / RFID / QR). `deviceId` and
 * `source` keep the integration boundary open — no hardware is assumed.
 */

import { addDays } from "./tenure";

export const ATTENDANCE_STATUS = {
  HADIR: "HADIR",
  IZIN: "IZIN",
  SAKIT: "SAKIT",
  ALFA: "ALFA",
  CUTI: "CUTI",
  LIBUR: "LIBUR",
  DINAS_LUAR: "DINAS_LUAR",
} as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  HADIR: "Hadir",
  IZIN: "Izin",
  SAKIT: "Sakit",
  ALFA: "Alfa",
  CUTI: "Cuti",
  LIBUR: "Libur",
  DINAS_LUAR: "Dinas Luar",
};

export const ATTENDANCE_SOURCE = {
  MANUAL: "MANUAL",
  WEB: "WEB",
  MOBILE: "MOBILE",
  FINGERPRINT: "FINGERPRINT",
  RFID: "RFID",
  QR: "QR",
} as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCE)[keyof typeof ATTENDANCE_SOURCE];

export const DEFAULT_LATE_THRESHOLD_MINUTES = 15;

export interface AttendanceRecord {
  _id: string;
  employeeId: string;
  /** yyyy-mm-dd */
  date: string;
  status: AttendanceStatus;
  checkIn?: string; // HH:mm
  checkOut?: string; // HH:mm
  lateMinutes?: number;
  overtimeMinutes?: number;
  source: AttendanceSource;
  deviceId?: string;
  notes?: string;
  recordedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export function minutesBetween(from: string | undefined, to: string | undefined): number {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return 0;
  let minutes = th * 60 + tm - (fh * 60 + fm);
  if (minutes < 0) minutes += 24 * 60; // crosses midnight
  return minutes;
}

export function isLate(
  checkIn: string | undefined,
  workStart: string,
  thresholdMinutes: number = DEFAULT_LATE_THRESHOLD_MINUTES,
): number {
  if (!checkIn) return 0;
  const [wh, wm] = workStart.split(":").map(Number);
  const [ch, cm] = checkIn.split(":").map(Number);
  if ([wh, wm, ch, cm].some((n) => Number.isNaN(n))) return 0;
  // Early arrival is never late — do not wrap around midnight here.
  const diff = (ch * 60 + cm) - (wh * 60 + wm);
  if (diff <= 0) return 0;
  return diff > thresholdMinutes ? diff : 0;
}

export function calculateOvertime(
  checkOut: string | undefined,
  workEnd: string,
  thresholdMinutes: number = 15,
): number {
  if (!checkOut) return 0;
  const diff = minutesBetween(workEnd, checkOut);
  return diff > thresholdMinutes ? diff : 0;
}

export interface AttendanceDay {
  date: string;
  dayOfWeek: number;
  isSunday: boolean;
  label: string;
}

export function buildMonth(period: string): AttendanceDay[] {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return [];
  const total = new Date(year, month, 0).getDate();
  const names = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(year, month - 1, index + 1);
    const dayOfWeek = date.getDay();
    return {
      date: `${period}-${String(index + 1).padStart(2, "0")}`,
      dayOfWeek,
      isSunday: dayOfWeek === 0,
      label: names[dayOfWeek]!,
    };
  });
}

export interface AttendanceSummary {
  totalDays: number;
  hadir: number;
  izin: number;
  sakit: number;
  cuti: number;
  alfa: number;
  libur: number;
  dinasLuar: number;
  late: number;
  totalWorkMinutes: number;
  attendanceRate: number;
}

/** Minimal shape `summarizeAttendance` needs — keeps it usable on raw rows. */
export interface AttendanceLike {
  status: string;
  checkIn?: string;
  checkOut?: string;
  lateMinutes?: number;
}

export function summarizeAttendance(
  records: readonly AttendanceLike[],
  summary: { totalDays: number } = { totalDays: 0 },
): AttendanceSummary {
  const result: AttendanceSummary = {
    totalDays: summary.totalDays,
    hadir: 0,
    izin: 0,
    sakit: 0,
    cuti: 0,
    alfa: 0,
    libur: 0,
    dinasLuar: 0,
    late: 0,
    totalWorkMinutes: 0,
    attendanceRate: 0,
  };
  for (const record of records) {
    switch (record.status) {
      case "HADIR":
      case "DINAS_LUAR":
        result.hadir += 1;
        if (record.checkIn && record.checkOut) {
          result.totalWorkMinutes += minutesBetween(record.checkIn, record.checkOut);
        }
        break;
      case "IZIN":
        result.izin += 1;
        break;
      case "SAKIT":
        result.sakit += 1;
        break;
      case "CUTI":
        result.cuti += 1;
        break;
      case "ALFA":
        result.alfa += 1;
        break;
      case "LIBUR":
        result.libur += 1;
        break;
    }
    if ((record.lateMinutes ?? 0) > 0) result.late += 1;
  }
  const denominator = result.totalDays - result.libur;
  result.attendanceRate =
    denominator > 0 ? Math.round(((result.hadir) / denominator) * 1000) / 10 : 0;
  return result;
}

export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso(): string {
  return addDays(new Date(), 0).toISOString().slice(0, 10);
}
