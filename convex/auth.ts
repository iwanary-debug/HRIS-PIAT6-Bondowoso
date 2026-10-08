/**
 * Authentication API.
 * Session tokens are opaque random strings; only their SHA-256 hash is stored.
 * The first registered account becomes SUPER_ADMIN (see `ensureBootstrapUser`).
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { generateToken, hashPassword, hashToken, verifyPassword } from "./lib/crypto";
import { mintSessionJwt, verifySessionJwt } from "./lib/sessionJwt";
import { SESSION_DURATION_MS, getUser, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { ROLES } from "../src/domain/permissions";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const login = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user || !user.active) throw new Error("INVALID_CREDENTIALS");
    const ok = await verifyPassword(args.password, user.passwordHash);
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    // Issue a short-lived HS256 session JWT (required by the Convex sync
    // protocol) whose `sub` is the hash of the server-side opaque session.
    // Only the hash is stored, so the browser never holds a server secret.
    const tokenHash = hashToken(generateToken(48));
    await ctx.db.insert("sessions", {
      tokenHash,
      userId: user._id,
      expiresAt: Date.now() + SESSION_DURATION_MS,
      createdAt: Date.now(),
    });
    await ctx.db.patch(user._id, { lastLoginAt: Date.now() });

    await writeAudit(ctx, null, {
      action: AUDIT_ACTION.LOGIN,
      entity: "user",
      recordId: user._id,
      summary: `${user.name} berhasil masuk`,
      metadata: { email: user.email, role: user.role },
    });

    return { token: mintSessionJwt(tokenHash), expiresAt: Date.now() + SESSION_DURATION_MS };
  },
});

export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (args.password.length < 8) throw new Error("PASSWORD_TOO_SHORT");
    const anyUser = await ctx.db.query("users").first();
    // The very first account may always self-register (that is how the instance
    // gets its Super Admin). After that the institution decides: public sign-up
    // can be switched off in Settings, because HRD creates accounts directly.
    if (anyUser) {
      const flag = await ctx.db
        .query("settings")
        .withIndex("key", (q) => q.eq("key", "selfRegistration"))
        .unique();
      if (flag?.value === false) throw new Error("REGISTRATION_DITUTUP");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error("EMAIL_TAKEN");

    // First account bootstraps the instance as SUPER_ADMIN. Everyone after
    // that starts as EMPLOYEE_SELF_SERVICE — a Super Admin promotes the role
    // from Settings, so public sign-up can never hand out HRD access.
    const role = anyUser ? ROLES.EMPLOYEE_SELF_SERVICE : ROLES.SUPER_ADMIN;
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: args.name.trim(),
      email,
      passwordHash: await hashPassword(args.password),
      role,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, null, {
      action: AUDIT_ACTION.CREATE,
      entity: "user",
      recordId: userId,
      summary: `Pengguna ${args.name.trim()} dibuat dengan peran ${role}`,
    });
    return { userId };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // The stored token is a session JWT; fall back to raw hashing so legacy
    // opaque tokens from before the JWT switch still revoke correctly.
    const verified = verifySessionJwt(args.token);
    const tokenHash = verified ? verified.subject : hashToken(args.token);
    const sessionRow = await ctx.db
      .query("sessions")
      .withIndex("tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (sessionRow) await ctx.db.delete(sessionRow._id);
    return { ok: true as const };
  },
});

export const session = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  },
});

export const currentProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const employee = user.employeeId ? await ctx.db.get(user.employeeId) : null;
    return {
      ...user,
      mustChangePassword: Boolean(user.mustChangePassword),
      employee: employee
        ? { _id: employee._id, namaLengkap: employee.namaLengkap, niy: employee.niy }
        : null,
    };
  },
});

export const changePassword = mutation({
  args: { currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const auth = await requireUser(ctx);
    if (args.newPassword.length < 8) throw new Error("PASSWORD_TOO_SHORT");
    const user = await ctx.db.get(auth.id);
    if (!user) throw new Error("NOT_FOUND");
    const ok = await verifyPassword(args.currentPassword, user.passwordHash);
    if (!ok) throw new Error("INVALID_CREDENTIALS");
    await ctx.db.patch(user._id, {
      passwordHash: await hashPassword(args.newPassword),
      // The temporary password issued by an admin has now been replaced by one
      // the user chose, so stop nagging them on every page load.
      mustChangePassword: false,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, auth, {
      action: AUDIT_ACTION.UPDATE,
      entity: "user",
      recordId: user._id,
      summary: "Password pengguna diperbarui",
    });
    return { ok: true };
  },
});

/** Public instance metadata for the login screen. */
export const instanceInfo = query({
  args: {},
  handler: async (ctx) => {
    const hasUsers = !!(await ctx.db.query("users").first());
    const settings = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "institution"))
      .unique();
    const registration = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "selfRegistration"))
      .unique();
    const institution = settings?.value as { name?: string; subtitle?: string } | undefined;
    return {
      bootstrapped: hasUsers,
      // Absent flag means "open", so an existing instance is unaffected until
      // the Super Admin explicitly closes public sign-up.
      selfRegistrationOpen: hasUsers ? registration?.value !== false : true,
      institutionName: institution?.name ?? "Pesantren Islam Al Irsyad Tengaran 6 Bondowoso",
      institutionSubtitle:
        institution?.subtitle ?? "Human Resources Information System",
    };
  },
});
