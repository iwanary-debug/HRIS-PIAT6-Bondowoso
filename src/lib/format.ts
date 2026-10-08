/** Indonesian-locale formatting helpers used across the HRIS UI. */

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
const MONTHS_LONG = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAYS_LONG = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateLong(iso: string | undefined | null): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return `${DAYS_LONG[date.getDay()]}, ${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTime(timestamp: number | undefined | null): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "baru saja";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatDate(new Date(timestamp).toISOString().slice(0, 10));
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | undefined | null, digits = 1): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "0%";
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function formatPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

export function initialsOf(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export { DAYS_LONG, DAYS_SHORT, MONTHS_LONG, MONTHS_SHORT };
