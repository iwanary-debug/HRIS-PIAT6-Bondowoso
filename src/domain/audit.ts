/**
 * Audit trail domain.
 * Records WHO did WHAT, WHEN, on WHICH entity/record. Raw sensitive values are
 * never written: changes are redacted to `changed: true` plus a masked hint.
 */

export const AUDIT_ACTION = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  DEACTIVATE: "DEACTIVATE",
  REACTIVATE: "REACTIVATE",
  IMPORT: "IMPORT",
  EXPORT: "EXPORT",
  VIEW_SENSITIVE: "VIEW_SENSITIVE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  UPLOAD: "UPLOAD",
  DOWNLOAD: "DOWNLOAD",
  PERMISSION_CHANGE: "PERMISSION_CHANGE",
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: "Membuat data",
  UPDATE: "Memperbarui data",
  DELETE: "Menghapus data",
  DEACTIVATE: "Menonaktifkan karyawan",
  REACTIVATE: "Mengaktifkan kembali",
  IMPORT: "Import data",
  EXPORT: "Export data",
  VIEW_SENSITIVE: "Melihat data sensitif",
  LOGIN: "Masuk",
  LOGOUT: "Keluar",
  APPROVE: "Menyetujui",
  REJECT: "Menolak",
  UPLOAD: "Mengunggah berkas",
  DOWNLOAD: "Mengunduh berkas",
  PERMISSION_CHANGE: "Perubahan hak akses",
};

export const SENSITIVE_AUDIT_FIELDS = new Set([
  "nik",
  "bpjsKesehatanNumber",
  "bpjsKetenagakerjaanNumber",
  "bankAccountNumber",
  "noRekening",
  "alamatKtp",
  "noHp",
  "email",
  "tempatLahir",
  "passwordHash",
  "salary",
  "baseSalary",
]);

export interface FieldChange {
  field: string;
  changed: boolean;
  /** Masked hint only — never the raw sensitive value. */
  hint?: string;
}

export interface AuditEntry {
  _id: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  action: AuditAction;
  entity: string;
  recordId?: string;
  /** Short human summary, e.g. "Impor 120 baris (12 baru, 3 diperbarui)". */
  summary: string;
  changes?: FieldChange[];
  metadata?: Record<string, string | number | boolean | null>;
  ip?: string;
  createdAt: number;
}

/** Redact a before/after pair into a log-safe change list. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const previous = before[field];
    const next = after[field];
    if (String(previous ?? "") === String(next ?? "")) continue;
    const sensitive = SENSITIVE_AUDIT_FIELDS.has(field);
    changes.push({
      field,
      changed: true,
      hint: sensitive
        ? "diubah (nilai disamarkan)"
        : maskHint(next as string | undefined),
    });
  }
  return changes;
}

function maskHint(value: string | undefined): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value);
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}…${text.slice(-3)}`;
}
