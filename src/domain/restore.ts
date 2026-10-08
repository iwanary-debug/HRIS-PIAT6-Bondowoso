/**
 * Restore domain — the mapping rules shared by the analyse and execute steps.
 *
 * Restoring a snapshot is mostly bookkeeping, not data entry: every row in the
 * file carries the `_id` it had on the machine that produced the backup, and
 * those ids mean nothing here. So a restore has to rebuild the whole graph —
 * insert units, then positions, then employees, translating every reference on
 * the way. Getting the order or the remapping wrong silently produces a
 * database full of dangling references, which is why this file spells the
 * relationships out explicitly instead of guessing them at runtime.
 */

/** Reference fields: for each table, which fields point at which table. */
export const RESTORE_FOREIGN_KEYS: Record<string, Record<string, string>> = {
  users: { employeeId: "employees", unitId: "organizationUnits" },
  organizationUnits: { parentId: "organizationUnits", headPositionId: "positions" },
  positions: { reportsToPositionId: "positions", unitId: "organizationUnits" },
  positionAssignments: {
    employeeId: "employees",
    positionId: "positions",
    unitId: "organizationUnits",
    supervisorId: "employees",
  },
  employees: {
    bidangId: "organizationUnits",
    jabatanId: "positions",
    createdBy: "users",
    updatedBy: "users",
  },
  contracts: { employeeId: "employees", skDocumentId: "documents", createdBy: "users" },
  attendanceRecords: { employeeId: "employees", recordedBy: "users" },
  leaveRequests: {
    employeeId: "employees",
    requestedBy: "users",
    decidedBy: "users",
    attachmentDocumentId: "documents",
  },
  leaveHistory: { leaveRequestId: "leaveRequests", actorId: "users", employeeId: "employees" },
  leaveBalances: { employeeId: "employees" },
  salaryStructures: { employeeId: "employees", createdBy: "users" },
  payslips: { periodId: "payrollPeriods", employeeId: "employees" },
  benefits: { employeeId: "employees", competencyId: "competencies" },
  educationRecords: { employeeId: "employees" },
  employeeCompetencies: {
    employeeId: "employees",
    competencyId: "competencies",
    certificationDocumentId: "documents",
    assessedBy: "users",
  },
  trainingParticipants: {
    trainingId: "trainings",
    employeeId: "employees",
    certificateDocumentId: "documents",
  },
  performanceAssessments: { employeeId: "employees", evaluatorId: "users" },
  performanceScores: {
    assessmentId: "performanceAssessments",
    indicatorId: "performanceIndicators",
  },
  disciplineRecords: { employeeId: "employees", recordedBy: "users" },
  documents: { employeeId: "employees", uploadedBy: "users" },
  mutations: {
    employeeId: "employees",
    fromPositionId: "positions",
    toPositionId: "positions",
    fromUnitId: "organizationUnits",
    toUnitId: "organizationUnits",
    skDocumentId: "documents",
    createdBy: "users",
  },
  resignations: {
    employeeId: "employees",
    requestedBy: "users",
    decidedBy: "users",
    documentId: "documents",
  },
  importSessions: { createdBy: "users" },
  auditLogs: { actorId: "users" },
  settings: { updatedBy: "users" },
};

/**
 * Fields that identify a row across machines, used to match a backup row with
 * what is already in the database.
 *
 * `_id` cannot serve this purpose: ids differ per deployment. `employees.niy`
 * is the real business identifier and is unique by design.
 */
export const RESTORE_NATURAL_KEYS: Record<string, string[]> = {
  users: ["email"],
  employees: ["niy"],
  organizationUnits: ["kode"],
  positions: ["kode"],
  payrollComponents: ["code"],
  competencies: ["name"],
  trainings: ["kode"],
  settings: ["key"],
  contracts: ["nomor"],
  leaveRequests: ["nomor"],
  resignations: ["nomor"],
};

/**
 * Tables in dependency order.
 *
 * A table may only reference tables listed ABOVE it. `users` sits above
 * `employees` even though `users.employeeId` points at employees — that link is
 * applied in a second pass, once every employee exists, and the same trick
 * handles the self-referencing unit/position hierarchies.
 */
export const RESTORE_ORDER = [
  "users",
  "organizationUnits",
  "positions",
  "payrollComponents",
  "competencies",
  "performanceIndicators",
  "trainings",
  "payrollPeriods",
  "settings",
  "employees",
  "positionAssignments",
  "documents",
  "contracts",
  "attendanceRecords",
  "leaveRequests",
  "leaveHistory",
  "leaveBalances",
  "salaryStructures",
  "payslips",
  "benefits",
  "educationRecords",
  "employeeCompetencies",
  "trainingParticipants",
  "performanceAssessments",
  "performanceScores",
  "disciplineRecords",
  "mutations",
  "resignations",
  "importSessions",
  "auditLogs",
] as const;

/** Never restored: sessions (live tokens), bootReports, backupSnapshots itself. */
export const RESTORE_SKIPPED_TABLES = new Set(["sessions", "bootReports", "backupSnapshots"]);

export const RESTORE_MODES = ["REPLACE", "MERGE"] as const;
export type RestoreMode = (typeof RESTORE_MODES)[number];

export const RESTORE_MODE_LABELS: Record<RestoreMode, string> = {
  REPLACE: "Timpatotal",
  MERGE: "Gabungkan",
};

/** What the operator is about to do, described before they commit to it. */
export interface RestorePreview {
  valid: boolean;
  /** Blocking problems — the restore cannot run while any of these exist. */
  errors: string[];
  /** Things worth knowing that do not block the restore. */
  warnings: string[];
  format: string;
  version: number;
  mode: string;
  generatedAt: number;
  totalRows: number;
  perTable: { table: string; rows: number; newRows: number; existingRows: number }[];
  isComplete: boolean;
}

/** A backup that dropped the sensitive columns cannot rebuild a full database. */
export function isCompleteSnapshot(mode: unknown): boolean {
  return mode === "full";
}

/**
 * Shape check for an uploaded file.
 *
 * The file arrives from a browser and could be anything at all, so validation
 * is deliberately strict and returns messages rather than throwing: the operator
 * needs to be told what is wrong before anything is written.
 */
export function inspectSnapshot(
  parsed: unknown,
  existingNaturalKeys: Record<string, Set<string>>,
): RestorePreview {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!parsed || typeof parsed !== "object") {
    return emptyPreview(["Berkas bukan objek JSON yang valid."]);
  }
  const file = parsed as Record<string, unknown>;
  if (file.format !== "hris-piat6-backup") {
    errors.push(
      `Format tidak dikenal: "${String(file.format ?? "-")}". Pastikan berkas memang hasilCadangan aplikasi ini.`,
    );
  }
  if (typeof file.version !== "number") {
    errors.push("Versi cadangan tidak terbaca — berkas mungkin terpotong.");
  }
  const tables = file.tables;
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    return emptyPreview(["Berkas tidak memuat bagian `tables`."], errors);
  }

  const rowsByTable = tables as Record<string, unknown>;
  let totalRows = 0;
  const perTable: RestorePreview["perTable"] = [];

  for (const table of RESTORE_ORDER) {
    const rows = rowsByTable[table];
    if (rows === undefined) {
      warnings.push(`Tabel "${table}" tidak ada di berkas — akan dilewati.`);
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`Tabel "${table}" bukan daftar.`);
      continue;
    }
    const known = existingNaturalKeys[table];
    let newRows = 0;
    let existingRows = 0;
    for (const row of rows) {
      totalRows += 1;
      if (!row || typeof row !== "object") {
        errors.push(`Tabel "${table}" memuat baris yang bukan objek.`);
        continue;
      }
      const keys = RESTORE_NATURAL_KEYS[table];
      if (!keys || !known) continue;
      const value = keys.map((k) => (row as Record<string, unknown>)[k]).find((v) => v != null);
      if (value != null && known.has(String(value))) existingRows += 1;
      else newRows += 1;
    }
    perTable.push({ table, rows: rows.length, newRows, existingRows });
  }

  const unknown = Object.keys(rowsByTable).filter(
    (table) => !(RESTORE_ORDER as readonly string[]).includes(table),
  );
  if (unknown.length) warnings.push(`Tabel tidak dikenal di berkas, dilewati: ${unknown.join(", ")}.`);

  if (totalRows === 0) errors.push("Berkas tidak memuat satu pun baris data.");
  if (!isCompleteSnapshot(file.mode)) {
    warnings.push(
      "Berkas ini dibuat dalam mode aman: kolom NIK, BPJS, rekening, alamat, dan nomor HP tidak disertakan. Memulihkannya akan mengembalikan data tanpa nilai-nilai tersebut.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    format: String(file.format ?? "-"),
    version: Number(file.version ?? 0),
    mode: String(file.mode ?? "-"),
    generatedAt: Number(file.generatedAt ?? 0),
    totalRows,
    perTable,
    isComplete: isCompleteSnapshot(file.mode),
  };
}

function emptyPreview(errors: string[], extra: string[] = []): RestorePreview {
  return {
    valid: false,
    errors: [...errors, ...extra],
    warnings: [],
    format: "-",
    version: 0,
    mode: "-",
    generatedAt: 0,
    totalRows: 0,
    perTable: [],
    isComplete: false,
  };
}

/**
 * Composite natural key for one row, used to match backup rows to live rows.
 * Empty string when the table has no natural key (then rows are always new).
 */
export function naturalKeyOf(table: string, row: Record<string, unknown>): string {
  const keys = RESTORE_NATURAL_KEYS[table];
  if (!keys) return "";
  return keys
    .map((key) => row[key])
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim().toLowerCase())
    .join("|");
}

/** Human summary of a preview, for the confirmation dialog. */
export function describePreview(preview: RestorePreview): string {
  const date = preview.generatedAt
    ? new Date(preview.generatedAt).toLocaleString("id-ID")
    : "tidak diketahui";
  return `${preview.totalRows.toLocaleString("id-ID")} baris · ${preview.perTable.filter((t) => t.rows > 0).length} tabel · dibuat ${date}`;
}