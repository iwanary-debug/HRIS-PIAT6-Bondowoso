import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLES,
  can,
  canAll,
  canAny,
  permissionsForRoles,
} from "@/domain/permissions";

describe("role -> permission matrix", () => {
  it("gives Super Admin every permission", () => {
    expect(ROLE_PERMISSIONS[ROLES.SUPER_ADMIN]).toEqual(ALL_PERMISSIONS);
  });

  it("gives every role the self-service read permission", () => {
    for (const role of Object.values(ROLES)) {
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.HR_SELF_VIEW);
    }
  });

  it("keeps an employee strictly limited to their own portal", () => {
    const employee = ROLE_PERMISSIONS[ROLES.EMPLOYEE_SELF_SERVICE];
    expect(employee).toEqual([PERMISSIONS.HR_SELF_VIEW, PERMISSIONS.HR_LEAVE_REQUEST]);
    // No access to any other employee's data, payroll, settings or audit trail.
    for (const forbidden of [
      PERMISSIONS.HR_VIEW,
      PERMISSIONS.HR_SENSITIVE_VIEW,
      PERMISSIONS.HR_EDIT,
      PERMISSIONS.HR_DELETE,
      PERMISSIONS.HR_PAYROLL_VIEW,
      PERMISSIONS.HR_LEAVE_APPROVE,
      PERMISSIONS.HR_SETTINGS,
      PERMISSIONS.HR_AUDIT_VIEW,
    ]) {
      expect(employee).not.toContain(forbidden);
    }
  });

  it("lets HRD roles file leave but not manage users", () => {
    for (const role of [ROLES.HRD_ADMIN, ROLES.HRD_STAFF, ROLES.UNIT_MANAGER]) {
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.HR_LEAVE_REQUEST);
    }
    for (const role of [ROLES.HRD_ADMIN, ROLES.HRD_STAFF, ROLES.UNIT_MANAGER, ROLES.REPORT_VIEWER]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.HR_SETTINGS);
    }
    // Only a report viewer must not be able to file leave requests.
    expect(ROLE_PERMISSIONS[ROLES.REPORT_VIEWER]).not.toContain(PERMISSIONS.HR_LEAVE_REQUEST);
  });

  it("only exposes permissions that exist in the contract", () => {
    for (const role of Object.values(ROLES)) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
  });
});

describe("permission helpers", () => {
  const employee = permissionsForRoles([ROLES.EMPLOYEE_SELF_SERVICE]);

  it("unions permissions across multiple roles without duplicates", () => {
    const combined = permissionsForRoles([ROLES.EMPLOYEE_SELF_SERVICE, ROLES.HRD_STAFF]);
    expect(combined).toContain(PERMISSIONS.HR_SELF_VIEW);
    expect(combined).toContain(PERMISSIONS.HR_EDIT);
    expect(new Set(combined).size).toBe(combined.length);
  });

  it("answers can/canAny/canAll from a granted list", () => {
    expect(can(employee, PERMISSIONS.HR_SELF_VIEW)).toBe(true);
    expect(can(employee, PERMISSIONS.HR_PAYROLL_VIEW)).toBe(false);
    expect(canAny(employee, [PERMISSIONS.HR_SETTINGS, PERMISSIONS.HR_SELF_VIEW])).toBe(true);
    expect(canAll(employee, [PERMISSIONS.HR_SELF_VIEW, PERMISSIONS.HR_LEAVE_REQUEST])).toBe(true);
    expect(canAll(employee, [PERMISSIONS.HR_SELF_VIEW, PERMISSIONS.HR_DELETE])).toBe(false);
  });

  it("treats an undefined grant list as no access", () => {
    expect(can(undefined, PERMISSIONS.HR_SELF_VIEW)).toBe(false);
  });

  it("labels every role for the settings matrix table", () => {
    for (const role of Object.values(ROLES)) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});
