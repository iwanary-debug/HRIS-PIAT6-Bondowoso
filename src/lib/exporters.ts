/**
 * Export helpers — CSV, XLSX and print-to-PDF.
 * All exports are produced client-side from server-authorized rows, and every
 * sensitive-capable export is audited on the backend before rows leave it.
 */

import * as XLSX from "xlsx";

export interface ExportColumn {
  key: string;
  label: string;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @ prefixes).
  const guarded = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(columns: readonly ExportColumn[], rows: readonly Record<string, unknown>[]): string {
  const header = columns.map((column) => escapeCell(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(","));
  return [header, ...body].join("\r\n");
}

export function downloadBlob(content: BlobPart, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadCsv(
  filename: string,
  columns: readonly ExportColumn[],
  rows: readonly Record<string, unknown>[],
): void {
  // BOM so Excel opens Indonesian text correctly.
  downloadBlob(`\uFEFF${toCsv(columns, rows)}`, filename, "text/csv;charset=utf-8");
}

export function downloadXlsx(
  filename: string,
  sheetName: string,
  columns: readonly ExportColumn[],
  rows: readonly Record<string, unknown>[],
): void {
  const data = rows.map((row) => Object.fromEntries(columns.map((c) => [c.label, row[c.key] ?? ""])));
  const sheet = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  sheet["!cols"] = columns.map((column) => ({ wch: Math.max(10, Math.min(40, column.label.length + 6)) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 30) || "Laporan");
  XLSX.writeFile(book, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Print-friendly window (user can "Save as PDF" from the browser dialog). */
export function printTable(
  title: string,
  subtitle: string,
  columns: readonly ExportColumn[],
  rows: readonly Record<string, unknown>[],
): void {
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`)
    .join("");
  const win = window.open("", "_blank", "width=980,height=720");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; box-sizing: border-box; }
      body { margin: 32px; color: #0f1f3f; }
      header { border-bottom: 3px solid #0f1f3f; padding-bottom: 12px; margin-bottom: 18px; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      p { margin: 0; font-size: 12px; color: #475569; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #0f1f3f; color: #fff; text-align: left; padding: 6px 8px; }
      td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; }
      tr:nth-child(even) td { background: #f8fafc; }
      footer { margin-top: 16px; font-size: 10px; color: #64748b; }
      @media print { body { margin: 12px; } }
    </style></head><body>
    <header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></header>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <footer>HRIS PIAT6 Bondowoso · Pesantren Islam Al Irsyad Tengaran 6 Bondowoso · Dicetak ${new Date().toLocaleString("id-ID")}</footer>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

const EMPLOYEE_BASE_COLUMNS: ExportColumn[] = [
  { key: "niy", label: "NIY" },
  { key: "namaLengkap", label: "Nama Lengkap" },
  { key: "bidang", label: "Bidang" },
  { key: "jabatan", label: "Jabatan" },
  { key: "status", label: "Status" },
  { key: "statusAkad", label: "Status Akad" },
  { key: "tanggalBergabung", label: "Tanggal Bergabung" },
  { key: "masaKerjaLabel", label: "Masa Kerja" },
  { key: "usia", label: "Usia" },
  { key: "tanggalLahir", label: "Tanggal Lahir" },
  { key: "statusPernikahan", label: "Status Pernikahan" },
  { key: "jumlahAnak", label: "Jumlah Anak" },
  { key: "pendidikanTerakhir", label: "Pendidikan Terakhir" },
  { key: "universitas", label: "Universitas" },
  { key: "jurusan", label: "Jurusan" },
];

const EMPLOYEE_SENSITIVE_COLUMNS: ExportColumn[] = [
  { key: "nik", label: "NIK" },
  { key: "bpjsKesehatanNumber", label: "No. BPJS Kesehatan" },
  { key: "bank", label: "Bank" },
  { key: "noRekening", label: "No. Rekening" },
  { key: "noHp", label: "No. HP" },
  { key: "email", label: "Email" },
  { key: "alamatKtp", label: "Alamat KTP" },
];

/** Export the employee list (sensitive columns only when authorized+audited). */
export function downloadEmployeesCsv(
  rows: readonly Record<string, unknown>[],
  includeSensitive: boolean,
): void {
  const columns = includeSensitive ? [...EMPLOYEE_BASE_COLUMNS, ...EMPLOYEE_SENSITIVE_COLUMNS] : EMPLOYEE_BASE_COLUMNS;
  downloadCsv(`data-karyawan-${new Date().toISOString().slice(0, 10)}.csv`, columns, rows);
}
