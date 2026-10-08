/**
 * Server-side authentication + authorization.
 *
 * The browser holds a bearer token in localStorage; it is sent as
 * `Authorization: Bearer <token>`. Only the SHA-256 hash is stored server-side.
 * EVERY public function that touches data must call `requireUser` and, for
 * protected operations, `requirePermission` — the UI check is never enough.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  type Permission,
  type Role,
  ROLES,
  permissionsForRoles,
} from "../../src/domain/permissions";

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export type Ctx = QueryCtx | MutationCtx;

export interface AuthenticatedUser {
  id: Id<"users">;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  employeeId?: Id<"employees">;
  unitId?: Id<"organizationUnits">;
  /** The account still uses a temporary password issued by an admin. */
  mustChangePassword: boolean;
}

function isRole(value: string): value is Role {
  return (Object.values(ROLES) as string[]).includes(value);
}

export async function getUser(ctx: Ctx): Promise<AuthenticatedUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  // The JWT `sub` is the SHA-256 of the server-side opaque session token,
  // so the tokenIdentifier lookup stays hash-based — see lib/sessionJwt.ts.
  const tokenHash = identity.subject;
  if (!tokenHash) return null;

  const session = await ctx.db
    .query("sessions")
    .withIndex("tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session) return null;  if (session.expiresAt < Date.now()) {
    try {
      await (ctx as MutationCtx).db.delete(session._id);
    } catch {
      // Read-only context: the expired row is simply ignored.
    }
    return null;
  }

  const user = await ctx.db.get(session.userId);
  if (!user || !user.active) return null;
  const role = isRole(user.role) ? user.role : ROLES.REPORT_VIEWER;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role,
    permissions: permissionsForRoles([role]),
    employeeId: user.employeeId,
    unitId: user.unitId,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export async function requireUser(ctx: Ctx): Promise<AuthenticatedUser> {
  const user = await getUser(ctx);
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export class PermissionError extends Error {
  permission: Permission;
  constructor(permission: Permission) {
    super(`FORBIDDEN:${permission}`);
    this.name = "PermissionError";
    this.permission = permission;
  }
}

export function assertPermission(
  user: AuthenticatedUser,
  permission: Permission,
): void {
  if (!user.permissions.includes(permission)) throw new PermissionError(permission);
}

export async function requirePermission(
  ctx: Ctx,
  permission: Permission,
): Promise<AuthenticatedUser> {
  const user = await requireUser(ctx);
  assertPermission(user, permission);
  return user;
}

export function hasPermission(
  user: AuthenticatedUser | null,
  permission: Permission,
): boolean {
  return !!user?.permissions.includes(permission);
}

/**
 * EMPLOYEE_SELF_SERVICE may only read their own record. Any other role with the
 * permission sees everyone. UNIT_MANAGER is scoped to their unit.
 */
interface EmployeeRef {
  _id: Id<"employees">;
}

export function canAccessEmployee(
  user: AuthenticatedUser,
  employee: EmployeeRef,
  unitId?: Id<"organizationUnits">,
): boolean {
  if (user.role === ROLES.EMPLOYEE_SELF_SERVICE) {
    return user.employeeId === employee._id;
  }
  if (user.role === ROLES.UNIT_MANAGER) {
    return !user.unitId || !unitId || user.unitId === unitId;
  }
  return true;
}

export function assertCanAccessEmployee(
  user: AuthenticatedUser,
  employee: EmployeeRef,
  unitId?: Id<"organizationUnits">,
): void {
  if (!canAccessEmployee(user, employee, unitId)) {
    throw new Error("FORBIDDEN:HR_VIEW");
  }
}

export const SESSION_DURATION_MS = SESSION_TTL_MS;

export type UserDoc = Doc<"users">;
