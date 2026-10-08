/**
 * Import Karyawan — validation, auto-mapping and duplicate detection.
 *
 * NIY is the unique business identifier. Duplicates are detected both inside
 * the uploaded file and against the existing database, and are never silently
 * overwritten: the operator picks UPDATE / SKIP / ERROR.
 */

import { type EmployeeStatus, type MaritalStatus } from "../employee";
import { calculateAge, calculateTenure } from "../tenure";
import { SOURCE_COLUMNS, SOURCE_COLUMN_BY_KEY, type SourceColumnKey } from "./columns";
import { cleanText, coerceDate, coerceEnum, coerceNumber } from "./normalize";

export type RowSeverity = "ERROR" | "WARNING" | "INFO";

export interface RowIssue {
  severity: RowSeverity;
  column?: SourceColumnKey;
  message: string;
}

export const DUPLICATE_SOURCE = {
  IN_FILE: "IN_FILE",
  DATABASE: "DATABASE",
} as const;
export type DuplicateSource = (typeof DUPLICATE_SOURCE)[keyof typeof DUPLICATE_SOURCE];

export type ImportRowStatus = "NEW" | "UPDATE" | "SKIP" | "ERROR" | "SKIP_EMPTY";

export interface ValidatedRow {
  /** 1-based position in the source file, after blank rows were dropped. */
  rowNumber: number;
  niy: string;
  values: Record<string, string | number | undefined>;
  issues: RowIssue[];
  duplicate: { niy: string; source: DuplicateSource; existingName?: string } | null;
  /** Resolved action; `null` while awaiting the operator's duplicate rule. */
  action: ImportRowStatus | null;
  derived: { age?: number; masaKerja?: string; status: EmployeeStatus };
  /** The untouched source cells; used only to explain skipped rows to the operator. */
  raw?: readonly unknown[];
}

export interface ImportSummary {
  totalRows: number;
  valid: number;
  warnings: number;
  errors: number;
  duplicates: number;
  newRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  /** Rows carrying no NIY and no name — not employee data at all. */
  emptyRows: number;
}

export function emptySummary(): ImportSummary {
  return {
    totalRows: 0,
    valid: 0,
    warnings: 0,
    errors: 0,
    duplicates: 0,
    newRecords: 0,
    updatedRecords: 0,
    skippedRecords: 0,
    emptyRows: 0,
  };
}

export function summarize(rows: readonly ValidatedRow[]): ImportSummary {
  const summary = emptySummary();
  summary.totalRows = rows.length;
  for (const row of rows) {
    if (row.action === "SKIP_EMPTY") {
      summary.emptyRows += 1;
      continue;
    }
    const hasError = row.issues.some((issue) => issue.severity === "ERROR");
    const hasWarning = row.issues.some((issue) => issue.severity === "WARNING");
    if (hasError) summary.errors += 1;
    else summary.valid += 1;
    if (hasWarning && !hasError) summary.warnings += 1;
    if (row.duplicate) summary.duplicates += 1;
    if (row.action === "NEW") summary.newRecords += 1;
    if (row.action === "UPDATE") summary.updatedRecords += 1;
    if (row.action === "SKIP") summary.skippedRecords += 1;
  }
  return summary;
}

export interface IssueBreakdownRow {
  severity: RowSeverity;
  column: SourceColumnKey | null;
  label: string;
  count: number;
  /** One real message, so the operator sees what the rule actually flagged. */
  example: string;
  firstRowNumber: number;
}

/**
 * Group every validation issue by rule so the summary card can explain *why*
 * the Error/Warning counters are what they are, instead of leaving the operator
 * with two bare numbers.
 */
export function summarizeIssues(rows: readonly ValidatedRow[]): IssueBreakdownRow[] {
  const buckets = new Map<string, IssueBreakdownRow>();
  for (const row of rows) {
    for (const issue of row.issues) {
      const key = `${issue.severity}:${issue.column ?? "-"}`;
      const columnMeta = issue.column ? SOURCE_COLUMN_BY_KEY[issue.column] : undefined;
      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      buckets.set(key, {
        severity: issue.severity,
        column: issue.column ?? null,
        label: columnMeta?.label ?? issue.column ?? "Umum",
        count: 1,
        example: issue.message,
        firstRowNumber: row.rowNumber,
      });
    }
  }
  const order: Record<RowSeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  return [...buckets.values()].sort(
    (a, b) => order[a.severity] - order[b.severity] || b.count - a.count,
  );
}

export const DUPLICATE_RULES = ["UPDATE", "SKIP", "ERROR"] as const;
export type DuplicateRule = (typeof DUPLICATE_RULES)[number];

/**
 * Apply the chosen duplicate rule to every duplicated row. Rows carrying
 * validation errors are always excluded (action ERROR) so a failing record is
 * never imported regardless of the operator's duplicate choice.
 */
export function applyDuplicateRule(
  rows: ValidatedRow[],
  rule: DuplicateRule,
): ValidatedRow[] {
  return rows.map((row) => {
    if (isEmptyRow(row)) return { ...row, action: "SKIP_EMPTY" };
    const hasError = row.issues.some((issue) => issue.severity === "ERROR");
    if (hasError) return { ...row, action: "ERROR" };
    if (!row.duplicate) return { ...row, action: "NEW" };
    if (row.duplicate.source === "IN_FILE") return { ...row, action: "ERROR" };
    return { ...row, action: rule };
  });
}

/**
 * A row with neither NIY nor name is not employee data — usually a totals row,
 * a section header or a footnote that happens to sit in a mapped column. It is
 * skipped instead of blocking the whole import with 900+ errors.
 */
export function isEmptyRow(row: ValidatedRow): boolean {
  return !String(row.niy ?? "").trim() && !String(row.values.namaLengkap ?? "").trim();
}

/** Human-readable sample of the source cells, so the operator can fix mapping. */
export function describeEmptyRows(
  rows: readonly ValidatedRow[],
): { count: number; exampleRowNumber: number; exampleCells: string } | null {
  const first = rows.find((row) => isEmptyRow(row));
  if (!first) return null;
  const cells = (first.raw ?? [])
    .map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim()))
    .filter((cell) => cell !== "");
  return {
    count: rows.filter((row) => isEmptyRow(row)).length,
    exampleRowNumber: first.rowNumber,
    exampleCells: cells.length ? cells.join(" · ") : "(sel kosong semua)",
  };
}

const STATUS_SYNONYMS: Record<string, string> = {
  aktif: "AKTIF",
  bekerja: "AKTIF",
  "active": "AKTIF",
  "on duty": "AKTIF",
  "tidak aktif": "TIDAK_AKTIF",
  nonaktif: "TIDAK_AKTIF",
  "non active": "TIDAK_AKTIF",
  resign: "RESIGN",
  "mengundurkan diri": "RESIGN",
  "berhenti": "RESIGN",
  purnabakti: "TIDAK_AKTIF",
  terminasi: "TERMINASI",
  dipecat: "TERMINASI",
};

const MARITAL_SYNONYMS: Record<string, string> = {
  belum: "BELUM_MENIKAH",
  "belum menikah": "BELUM_MENIKAH",
  "single": "BELUM_MENIKAH",
  menikah: "MENIKAH",
  married: "MENIKAH",
  "cerai hidup": "CERAI_HIDUP",
  "cerai mati": "CERAI_MATI",
  janda: "CERAI_MATI",
  duda: "CERAI_MATI",
};

export function normalizePendidikan(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const upper = text.toUpperCase();
  if (/^S3/.test(upper) || /DOKTOR|PHD/i.test(upper)) return "S3";
  if (/^S2/.test(upper) || /MAGISTER/i.test(upper)) return "S2";
  if (/^S1/.test(upper) || /SARJANA/i.test(upper)) return "S1";
  if (/^D[123]\b/.test(upper)) return upper.match(/^D[123]/)![0];
  if (/^SMA|^SMK/.test(upper)) return "SMA/SMK";
  if (/^SD|^SMP/.test(upper)) return "SD/SMP";
  return text;
}

/**
 * Validate and normalise one source row.
 * `existing` holds NIYs already in the database (lower-cased for comparison).
 */
export function validateRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  existingNiy: ReadonlySet<string> = new Set(),
  seenInFile: ReadonlySet<string> = new Set(),
  reference: Date = new Date(),
  sourceCells?: readonly unknown[],
): ValidatedRow {
  const issues: RowIssue[] = [];
  const values: Record<string, string | number | undefined> = {};
  const add = (severity: RowSeverity, column: SourceColumnKey | undefined, message: string) =>
    issues.push({ severity, column, message });

  for (const column of SOURCE_COLUMNS) {
    const rawValue = raw[column.key];
    switch (column.type) {
      case "date": {
        if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") break;
        const parsed = coerceDate(rawValue);
        if (!parsed) {
          add("ERROR", column.key, `Tanggal tidak valid: "${String(rawValue).slice(0, 40)}" (format dd/mm/yyyy atau yyyy-mm-dd)`);
        } else if (parsed > reference.toISOString().slice(0, 10)) {
          add("WARNING", column.key, "Tanggal berada di masa depan");
        } else {
          values[column.key] = parsed;
        }
        break;
      }
      case "number": {
        if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") break;
        const parsed = coerceNumber(rawValue);
        if (parsed === null) add("ERROR", column.key, `Angka tidak valid: "${String(rawValue).slice(0, 40)}"`);
        else values[column.key] = parsed;
        break;
      }
      case "enum": {
        if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") break;
        const synonyms =
          column.key === "status"
            ? STATUS_SYNONYMS
            : column.key === "statusPernikahan"
              ? MARITAL_SYNONYMS
              : {};
        const parsed = coerceEnum(rawValue, column.enumValues ?? [], synonyms);
        if (!parsed) {
          add(
            "ERROR",
            column.key,
            `Nilai tidak dikenali: "${String(rawValue).slice(0, 40)}". Pilihan: ${(column.enumValues ?? []).join(", ")}`,
          );
        } else {
          values[column.key] = parsed;
        }
        break;
      }
      default: {
        const text = cleanText(rawValue);
        if (text) values[column.key] = text;
      }
    }
  }

  // A row with no identity at all is not employee data; it is reported once and
  // skipped, never turned into a wall of errors.
  const isEmpty = !values.niy && !values.namaLengkap;
  if (isEmpty) {
    add("INFO", undefined, "Baris tanpa NIY dan Nama Lengkap — dilewati, bukan data karyawan");
  }

  // Required fields
  if (!isEmpty && !values.niy) add("ERROR", "niy", "NIY wajib diisi — sebagai business identifier");
  if (!isEmpty && !values.namaLengkap) add("ERROR", "namaLengkap", "Nama Lengkap wajib diisi");
  if (values.niy && String(values.niy).length > 30) add("ERROR", "niy", "NIY maksimal 30 karakter");

  // Field-level business rules
  const nik = values.nik as string | undefined;
  if (nik) {
    const digits = nik.replace(/\D/g, "");
    if (digits.length !== 16) add("ERROR", "nik", `NIK harus 16 digit (terisi ${digits.length})`);
  }
  const email = values.email as string | undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    add("WARNING", "email", `Format email tidak umum: "${email.slice(0, 40)}"`);
  }
  const noHp = values.noHp as string | undefined;
  if (noHp) {
    const digits = noHp.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      add("WARNING", "noHp", "Nomor HP tampak tidak lengkap");
    }
  }  if (!isEmpty && !values.bidang) add("WARNING", "bidang", "Bidang kosong — karyawan belum ditempatkan pada unit mana pun");
  if (!isEmpty && !values.jabatan) add("WARNING", "jabatan", "Jabatan kosong");
  if (!isEmpty && !values.tanggalBergabung) add("WARNING", "tanggalBergabung", "Tanggal Bergabung kosong — masa kerja tidak dapat dihitung");

  const status = (values.status as EmployeeStatus | undefined) ?? "AKTIF";
  const statusPernikahan = values.statusPernikahan as MaritalStatus | undefined;

  if (status === "RESIGN" || status === "TERMINASI") {
    if (!values.tmtResign) add("WARNING", "tmtResign", "Status resign/terminasi tanpa TMT Resign");
  }
  if (values.tmtResign && status === "AKTIF") {
    add("WARNING", "tmtResign", "TMT Resign diisi sementara Status masih Aktif");
  }

  if (values.pendidikanTerakhir) {
    values.pendidikanTerakhir = normalizePendidikan(values.pendidikanTerakhir) ?? undefined;
  }
  if (values.jumlahAnak !== undefined && Number(values.jumlahAnak) < 0) {
    add("ERROR", "jumlahAnak", "Jumlah anak tidak boleh negatif");
  }
  if (statusPernikahan === "BELUM_MENIKAH" && Number(values.jumlahAnak ?? 0) > 0) {
    add("WARNING", "jumlahAnak", "Jumlah anak > 0 sementara status Belum Menikah");
  }

  // Derived values are always recomputed, never trusted from the file.
  const age = calculateAge(values.tanggalLahir as string | undefined, reference);
  const tenure = calculateTenure(values.tanggalBergabung as string | undefined, reference);
  if (values.tanggalLahir && age === undefined) {
    add("ERROR", "tanggalLahir", "Tanggal lahir tidak valid");
  }
  if (values.usia !== undefined && age !== undefined && Number(values.usia) !== age) {
    add(
      "INFO",
      "usia",
      `Usia pada file (${values.usia}) berbeda dengan hasil hitung dari Tanggal Lahir (${age}). Nilai yang dipakai: ${age}`,
    );
  }
  if (values.masaKerja && tenure && String(values.masaKerja).trim() !== tenure.label) {
    add("INFO", "masaKerja", `Masa kerja pada file ("${String(values.masaKerja).slice(0, 30)}") dihitung ulang menjadi ${tenure.label}`);
  }

  // Duplicate detection — business key is NIY.
  const niy = String(values.niy ?? "");
  let duplicate: ValidatedRow["duplicate"] = null;
  if (niy) {
    const key = niy.toLowerCase();
    if (seenInFile.has(key)) duplicate = { niy, source: "IN_FILE" };
    else if (existingNiy.has(key)) duplicate = { niy, source: "DATABASE" };
  }

  return {
    rowNumber,
    niy,
    values,
    issues,
    duplicate,
    action: null,
    raw: sourceCells,
    derived: {
      age,
      masaKerja: tenure?.label,
      status,
    },
  };
}

