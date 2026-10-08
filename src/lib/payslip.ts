/**
 * Printable payslip.
 *
 * Lives outside `exporters.ts` on purpose: that module pulls in the XLSX
 * writer, and importing it from a page would drag the whole spreadsheet
 * library into the main bundle. Printing to a window keeps the payslip
 * identical everywhere and lets the browser save it as PDF.
 */

export interface PayslipLine {
  code?: string;
  name: string;
  kind?: string;
  amount: number;
}

export interface PayslipPrintData {
  period: string;
  namaLengkap: string;
  niy: string;
  jabatan?: string;
  bidang?: string;
  baseSalary: number;
  lines: readonly PayslipLine[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
}

const rupiah = (value: number) => `Rp ${Math.round(value).toLocaleString("id-ID")}`;

/**
 * Formal payslip in a print window. The browser's print dialog can save it as
 * PDF, which keeps the payslip identical on every device without shipping a
 * PDF library.
 */
export function printPayslip(data: PayslipPrintData): void {
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const earnings = data.lines.filter((line) => line.kind !== "DEDUCTION");
  const deductions = data.lines.filter((line) => line.kind === "DEDUCTION");
  const rowsFor = (lines: readonly PayslipLine[]) =>
    lines
      .map(
        (line) =>
          `<tr><td style="padding:4px 8px;border-bottom:1px solid #eef2f7">${escapeHtml(line.name)}` +
          `<span style="color:#94a3b8"> ${escapeHtml(line.code ?? "")}</span></td>` +
          `<td style="padding:4px 8px;border-bottom:1px solid #eef2f7;text-align:right;font-variant-numeric:tabular-nums">${escapeHtml(rupiah(line.amount))}</td></tr>`,
      )
      .join("");

  const block = (title: string, lines: readonly PayslipLine[], total: number) =>
    lines.length
      ? `<table style="width:100%;border-collapse:collapse;margin-top:6px">` +
        `<caption style="text-align:left;font-size:11px;font-weight:700;color:#0f1f3f;padding-bottom:4px">${title}</caption>` +
        `<tbody>${rowsFor(lines)}` +
        `<tr><td style="padding:6px 8px;font-weight:700">Total ${title}</td>` +
        `<td style="padding:6px 8px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${escapeHtml(rupiah(total))}</td></tr>` +
        `</tbody></table>`
      : "";

  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8" />
    <title>Slip gaji ${escapeHtml(data.period)} — ${escapeHtml(data.namaLengkap)}</title>
    <style>
      * { font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; box-sizing: border-box; }
      body { margin: 28px; color: #0f1f3f; font-size: 12px; }
      header { display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 3px solid #0f1f3f; padding-bottom: 12px; }
      h1 { font-size: 16px; margin: 0 0 2px; }
      p { margin: 0; color: #475569; font-size: 11px; }
      .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 24px; margin: 14px 0 4px; }
      .meta div { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
      .meta span:first-child { color: #64748b; }
      .net { margin-top: 16px; border: 2px solid #0f1f3f; border-radius: 8px; padding: 10px 14px;
        display: flex; justify-content: space-between; align-items: center; }
      .net strong { font-size: 16px; }
      footer { margin-top: 26px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
      @media print { body { margin: 12px; } .no-print { display: none; } }
    </style></head><body>
    <header>
      <div>
        <h1>SLIP GAJI KARYAWAN</h1>
        <p>Pesantren Islam Al Irsyad Tengaran 6 Bondowoso</p>
        <p>HRIS PIAT6 Bondowoso</p>
      </div>
      <div style="text-align:right">
        <p style="font-size:13px;font-weight:700;color:#0f1f3f">Periode ${escapeHtml(data.period)}</p>
        <p>Dicetak ${new Date().toLocaleString("id-ID")}</p>
      </div>
    </header>
    <div class="meta">
      <div><span>Nama</span><span>${escapeHtml(data.namaLengkap)}</span></div>
      <div><span>NIY</span><span>${escapeHtml(data.niy)}</span></div>
      <div><span>Jabatan</span><span>${escapeHtml(data.jabatan ?? "—")}</span></div>
      <div><span>Unit/Bidang</span><span>${escapeHtml(data.bidang ?? "—")}</span></div>
      <div><span>Gaji Pokok</span><span>${escapeHtml(rupiah(data.baseSalary))}</span></div>
      <div><span>Status</span><span>AKTIF</span></div>
    </div>
    ${block("Pendapatan", earnings, data.totalEarnings)}
    ${block("Potongan", deductions, data.totalDeductions)}
    <div class="net"><span>Gaji Diterima (Take Home Pay)</span><strong>${escapeHtml(rupiah(data.netPay))}</strong></div>
    <footer>
      <div>Tanda tangan karyawan<br/><br/><br/>..............................</div>
      <div style="text-align:right">Mengetahui,<br/>Bondowoso, ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}<br/><br/><br/>..............................<br/>Bagian SDM</div>
    </footer>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
