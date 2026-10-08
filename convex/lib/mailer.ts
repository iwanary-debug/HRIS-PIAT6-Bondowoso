/**
 * Outbound transactional email.
 *
 * Uses Plunk's public send API (a single secret key, no SDK). The whole
 * integration degrades gracefully: when `PLUNK_API_KEY` is not configured the
 * send is skipped and reported as `skipped`, so HRIS keeps working offline or
 * before the key is added.
 */

// Convex provides a `process.env` shim from deployment environment variables.
declare const process: { env: Record<string, string | undefined> };

const PLUNK_ENDPOINT = "https://api.useplunk.com/v1/send";

export interface MailResult {
  status: "sent" | "skipped" | "failed";
  detail?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

/** Shared layout so every HRIS email looks the same. */
function layout(title: string, rows: [string, string][], note?: string): string {
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;color:#475569;font-size:13px">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 12px;color:#0f1f3f;font-size:13px;font-weight:600;text-align:right">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return (
    `<div style="font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">` +
    `<div style="background:#0f1f3f;padding:18px 20px;color:#fff">` +
    `<p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.7">HRIS PIAT6 Bondowoso</p>` +
    `<h1 style="margin:4px 0 0;font-size:17px">${escapeHtml(title)}</h1>` +
    `</div>` +
    `<div style="padding:16px 8px">` +
    `<table style="width:100%;border-collapse:collapse">${table}</table>` +
    (note ? `<p style="margin:12px 20px 0;color:#475569;font-size:12px;line-height:1.6">${escapeHtml(note)}</p>` : "") +
    `</div>` +
    `<div style="border-top:1px solid #e2e8f0;padding:12px 20px;color:#64748b;font-size:11px">` +
    `Pesantren Islam Al Irsyad Tengaran 6 Bondowoso · pesan otomatis, tidak perlu dibalas` +
    `</div></div>`
  );
}

export interface LeaveMailData {
  to: string;
  employeeName: string;
  employeeNiy: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  nomor: string;
  status?: string;
  decidedBy?: string;
  decisionNote?: string;
}

export async function sendLeaveSubmittedEmail(data: LeaveMailData): Promise<MailResult> {
  const apiKey = process.env.PLUNK_API_KEY;
  if (!apiKey) return { status: "skipped", detail: "PLUNK_API_KEY belum diatur" };
  return post(apiKey, {
    to: data.to,
    subject: `[HRIS PIAT6] Pengajuan cuti ${data.nomor} — ${data.employeeName}`,
    body: layout(
      "Pengajuan cuti baru menunggu persetujuan",
      [
        ["Nomor", data.nomor],
        ["Karyawan", `${data.employeeName} (${data.employeeNiy})`],
        ["Jenis", data.leaveType],
        ["Periode", `${data.startDate} s.d. ${data.endDate}`],
        ["Total", `${data.totalDays} hari`],
        ["Alasan", data.reason],
      ],
      "Silakan buka HRIS PIAT6 → Cuti & Izin untuk menyetujui atau menolak pengajuan ini.",
    ),
  });
}

export async function sendLeaveDecisionEmail(data: LeaveMailData): Promise<MailResult> {
  const apiKey = process.env.PLUNK_API_KEY;
  if (!apiKey) return { status: "skipped", detail: "PLUNK_API_KEY belum diatur" };
  const approved = data.status === "APPROVED";
  return post(apiKey, {
    to: data.to,
    subject: `[HRIS PIAT6] Pengajuan cuti ${data.nomor} ${approved ? "DISETUJUI" : "DITOLAK"}`,
    body: layout(
      approved ? "Pengajuan cuti Anda disetujui" : "Pengajuan cuti Anda ditolak",
      [
        ["Nomor", data.nomor],
        ["Karyawan", data.employeeName],
        ["Jenis", data.leaveType],
        ["Periode", `${data.startDate} s.d. ${data.endDate}`],
        ["Total", `${data.totalDays} hari`],
        ["Status", data.status ?? "—"],
        ...(data.decidedBy ? ([["Diproses oleh", data.decidedBy]] as [string, string][]) : []),
      ],
      data.decisionNote || "Detail lengkap dapat dilihat pada Portal Karyawan Anda.",
    ),
  });
}

export async function sendPayslipEmail(data: {
  to: string;
  employeeName: string;
  period: string;
  netPay: number;
  totalEarnings: number;
  totalDeductions: number;
}): Promise<MailResult> {
  const apiKey = process.env.PLUNK_API_KEY;
  if (!apiKey) return { status: "skipped", detail: "PLUNK_API_KEY belum diatur" };
  return post(apiKey, {
    to: data.to,
    subject: `[HRIS PIAT6] Slip gaji ${data.period}`,
    body: layout(
      `Slip gaji ${data.period}`,
      [
        ["Karyawan", data.employeeName],
        ["Total pendapatan", rupiah(data.totalEarnings)],
        ["Total potongan", rupiah(data.totalDeductions)],
        ["Gaji diterima", rupiah(data.netPay)],
      ],
      "Rincian lengkap dapat diunduh dari Portal Karyawan Anda.",
    ),
  });
}

async function post(apiKey: string, payload: Record<string, unknown>): Promise<MailResult> {
  try {
    const response = await fetch(PLUNK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...payload, subscribed: false }),
    });
    if (!response.ok) {
      return { status: "failed", detail: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}` };
    }
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", detail: String(error).slice(0, 200) };
  }
}
