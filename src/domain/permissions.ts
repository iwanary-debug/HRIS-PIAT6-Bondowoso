/**
 * RBAC contract for HRIS PIAT6.
 *
 * Single source of truth for permissions. Imported by BOTH the Convex backend
 * (authoritative server-side enforcement) and the UI (navigation + control
 * visibility). The UI check is convenience only.
 *
 * Keep this module dependency-free so it can move verbatim into PIAT 6 Super App
 * as the shared identity/authorization module.
 */

export const PERMISSIONS = {
  HR_VIEW: "HR_VIEW",
  HR_CREATE: "HR_CREATE",
  HR_EDIT: "HR_EDIT",
  HR_DELETE: "HR_DELETE",
  HR_IMPORT: "HR_IMPORT",
  HR_EXPORT: "HR_EXPORT",
  HR_SENSITIVE_VIEW: "HR_SENSITIVE_VIEW",
  HR_CONTRACT_VIEW: "HR_CONTRACT_VIEW",
  HR_CONTRACT_EDIT: "HR_CONTRACT_EDIT",
  HR_PAYROLL_VIEW: "HR_PAYROLL_VIEW",
  HR_PAYROLL_EDIT: "HR_PAYROLL_EDIT",
  HR_ATTENDANCE_VIEW: "HR_ATTENDANCE_VIEW",
  HR_ATTENDANCE_EDIT: "HR_ATTENDANCE_EDIT",
  HR_LEAVE_VIEW: "HR_LEAVE_VIEW",
  HR_LEAVE_APPROVE: "HR_LEAVE_APPROVE",
  HR_PERFORMANCE_VIEW: "HR_PERFORMANCE_VIEW",
  HR_PERFORMANCE_EDIT: "HR_PERFORMANCE_EDIT",
  HR_DOCUMENT_VIEW: "HR_DOCUMENT_VIEW",
  HR_DOCUMENT_EDIT: "HR_DOCUMENT_EDIT",
  HR_TRAINING_VIEW: "HR_TRAINING_VIEW",
  HR_TRAINING_EDIT: "HR_TRAINING_EDIT",
  HR_REPORT_VIEW: "HR_REPORT_VIEW",
  HR_SETTINGS: "HR_SETTINGS",
  HR_AUDIT_VIEW: "HR_AUDIT_VIEW",
  /** Read your own record: profile, attendance, leave, payslip, documents. */
  HR_SELF_VIEW: "HR_SELF_VIEW",
  /** File a leave request (own record for employees, any record for HR). */
  HR_LEAVE_REQUEST: "HR_LEAVE_REQUEST",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  HRD_ADMIN: "HRD_ADMIN",
  HRD_STAFF: "HRD_STAFF",
  UNIT_MANAGER: "UNIT_MANAGER",
  REPORT_VIEWER: "REPORT_VIEWER",
  EMPLOYEE_SELF_SERVICE: "EMPLOYEE_SELF_SERVICE",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HRD_ADMIN: "Admin HRD",
  HRD_STAFF: "Staf HRD",
  UNIT_MANAGER: "Manajer Unit",
  REPORT_VIEWER: "Pelihat Laporan",
  EMPLOYEE_SELF_SERVICE: "Karyawan (Self Service)",
};

const READ_CORE = [
  PERMISSIONS.HR_VIEW,
  PERMISSIONS.HR_CONTRACT_VIEW,
  PERMISSIONS.HR_ATTENDANCE_VIEW,
  PERMISSIONS.HR_LEAVE_VIEW,
  PERMISSIONS.HR_PERFORMANCE_VIEW,
  PERMISSIONS.HR_DOCUMENT_VIEW,
  PERMISSIONS.HR_TRAINING_VIEW,
  PERMISSIONS.HR_REPORT_VIEW,
] as const;

/** Static role -> permission matrix. Roles stay data, not code paths. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  HRD_ADMIN: [
    ...READ_CORE,
    PERMISSIONS.HR_SELF_VIEW,
    PERMISSIONS.HR_LEAVE_REQUEST,
    PERMISSIONS.HR_CREATE,
    PERMISSIONS.HR_EDIT,
    PERMISSIONS.HR_IMPORT,
    PERMISSIONS.HR_EXPORT,
    PERMISSIONS.HR_SENSITIVE_VIEW,
    PERMISSIONS.HR_CONTRACT_EDIT,
    PERMISSIONS.HR_PAYROLL_VIEW,
    PERMISSIONS.HR_PAYROLL_EDIT,
    PERMISSIONS.HR_ATTENDANCE_EDIT,
    PERMISSIONS.HR_LEAVE_APPROVE,
    PERMISSIONS.HR_PERFORMANCE_EDIT,
    PERMISSIONS.HR_DOCUMENT_EDIT,
    PERMISSIONS.HR_TRAINING_EDIT,
    PERMISSIONS.HR_AUDIT_VIEW,
  ],
  HRD_STAFF: [
    ...READ_CORE,
    PERMISSIONS.HR_SELF_VIEW,
    PERMISSIONS.HR_LEAVE_REQUEST,
    PERMISSIONS.HR_CREATE,
    PERMISSIONS.HR_EDIT,
    PERMISSIONS.HR_IMPORT,
    PERMISSIONS.HR_EXPORT,
    PERMISSIONS.HR_ATTENDANCE_EDIT,
    PERMISSIONS.HR_DOCUMENT_EDIT,
    PERMISSIONS.HR_TRAINING_EDIT,
  ],
  UNIT_MANAGER: [
    PERMISSIONS.HR_SELF_VIEW,
    PERMISSIONS.HR_LEAVE_REQUEST,
    PERMISSIONS.HR_VIEW,
    PERMISSIONS.HR_CONTRACT_VIEW,
    PERMISSIONS.HR_ATTENDANCE_VIEW,
    PERMISSIONS.HR_ATTENDANCE_EDIT,
    PERMISSIONS.HR_LEAVE_VIEW,
    PERMISSIONS.HR_LEAVE_APPROVE,
    PERMISSIONS.HR_PERFORMANCE_VIEW,
    PERMISSIONS.HR_REPORT_VIEW,
  ],
  REPORT_VIEWER: [
    PERMISSIONS.HR_SELF_VIEW,
    PERMISSIONS.HR_VIEW,
    PERMISSIONS.HR_REPORT_VIEW,
    PERMISSIONS.HR_CONTRACT_VIEW,
  ],
  /** Karyawan: only their own record, and only their own leave requests. */
  EMPLOYEE_SELF_SERVICE: [PERMISSIONS.HR_SELF_VIEW, PERMISSIONS.HR_LEAVE_REQUEST],
};

export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) set.add(permission);
  }
  return [...set];
}

export function can(
  granted: readonly Permission[] | undefined,
  permission: Permission,
): boolean {
  return !!granted?.includes(permission);
}

export function canAny(
  granted: readonly Permission[] | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => can(granted, permission));
}

export function canAll(
  granted: readonly Permission[] | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => can(granted, permission));
}

/** Fields that must never be shown without HR_SENSITIVE_VIEW. */
export const SENSITIVE_FIELDS = [
  "nik",
  "bpjsKesehatanNumber",
  "bankAccountNumber",
  "alamatKtp",
  "noHp",
  "email",
  "salary",
] as const;

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];
