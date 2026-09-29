# HRIS PIAT6 — Security and Roles

## Roles (initial proposal)
- SUPER_ADMIN
- HRD_ADMIN
- HRD_STAFF
- UNIT_MANAGER
- VIEWER / REPORT_VIEWER
- EMPLOYEE_SELF_SERVICE

These are implementation starting points; permission granularity matters more
than role names.

## Permission groups
- HR_VIEW
- HR_CREATE
- HR_EDIT
- HR_DELETE
- HR_IMPORT
- HR_EXPORT
- HR_CONTRACT_VIEW
- HR_PAYROLL_VIEW
- HR_PAYROLL_EDIT
- HR_SENSITIVE_VIEW
- HR_ATTENDANCE_VIEW
- HR_ATTENDANCE_EDIT
- HR_LEAVE_VIEW
- HR_LEAVE_APPROVE
- HR_PERFORMANCE_VIEW
- HR_PERFORMANCE_EDIT
- HR_DOCUMENT_VIEW
- HR_DOCUMENT_EDIT
- HR_REPORT_VIEW
- HR_SETTINGS
- HR_AUDIT_VIEW

Sensitive fields require explicit permission.
All critical create/update/delete/approval/import operations require audit trail.
Server-side authorization is authoritative.
