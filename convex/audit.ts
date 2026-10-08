/**
 * Audit log + settings API.
 */

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { hashPassword } from "./lib/crypto";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, ROLE_LABELS, ALL_PERMISSIONS, type Role } from "../src/domain/permissions";
import { AUDIT_ACTION_LABELS } from "../src/domain/audit";
import { requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";

export const list = query({
  args: {
    action: v.optional(v.string()),
    entity: v.optional(v.string()),
    actorId: v.optional(v.id("users")),
    search: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.HR_AUDIT_VIEW);
    const all = await ctx.db.query("auditLogs").order("desc").collect();
    const term = args.search?.trim().toLowerCase();

    const filtered = all.filter((log) => {
      if (args.action && log.action !== args.action) return false;
      if (args.entity && log.entity !== args.entity) return false;
      if (args.actorId && log.actorId !== args.actorId) return false;
      if (args.from && log.createdAt < args.from) return false;
      if (args.to && log.createdAt > args.to) return false;
      if (term) {
        const haystack = `${log.summary} ${log.actorName ?? ""} ${log.actorEmail ?? ""} ${log.entity}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(200, Math.max(10, args.pageSize ?? 25));
    return {
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      data: filtered.slice((page - 1) * pageSize, page * pageSize).map((log) => ({
        id: log._id,
        action: log.action,
        actionLabel: AUDIT_ACTION_LABELS[log.action as never] ?? log.action,
        entity: log.entity,
        recordId: log.recordId,
        summary: log.summary,
        actorName: log.actorName ?? "Sistem",
        actorEmail: log.actorEmail,
        changes: log.changes ?? null,
        metadata: log.metadata ?? null,
        createdAt: log.createdAt,
      })),
    };
  },
});

export const facets = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_AUDIT_VIEW);
    const [logs, users] = await Promise.all([
      ctx.db.query("auditLogs").collect(),
      ctx.db.query("users").collect(),
    ]);
    const actions = new Map<string, number>();
    const entities = new Map<string, number>();
    for (const log of logs) {
      actions.set(log.action, (actions.get(log.action) ?? 0) + 1);
      entities.set(log.entity, (entities.get(log.entity) ?? 0) + 1);
    }
    return {
      actions: [...actions.entries()]
        .map(([value, count]) => ({
          value,
          label: AUDIT_ACTION_LABELS[value as never] ?? value,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      entities: [...entities.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      actors: users.map((u) => ({ id: u._id, name: u.name, email: u.email })),
    };
  },
});

/* ── Settings ───────────────────────────────────────────────────────── */

export const institution = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "institution"))
      .unique();
    return (
      (row?.value as { name: string; subtitle: string } | undefined) ?? {
        name: "Pesantren Islam Al Irsyad Tengaran 6 Bondowoso",
        subtitle: "Human Resources Information System",
      }
    );
  },
});

export const saveInstitution = mutation({
  args: { name: v.string(), subtitle: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    const existing = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "institution"))
      .unique();
    const value = { name: args.name.trim(), subtitle: args.subtitle ?? "" };
    if (existing) await ctx.db.patch(existing._id, { value, updatedAt: Date.now(), updatedBy: user.id });
    else
      await ctx.db.insert("settings", {
        key: "institution",
        value,
        updatedAt: Date.now(),
        updatedBy: user.id,
      });
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "settings",
      summary: "Identitas institusi diperbarui",
    });
    return { ok: true as const };
  },
});

/* ── User & role administration ─────────────────────────────────────── */

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    const users = await ctx.db.query("users").collect();
    const employees = await ctx.db.query("employees").collect();
    const employeeById = new Map(employees.map((e) => [e._id, e]));
    return users
      .map((u) => {
        const employee = u.employeeId ? employeeById.get(u.employeeId) : undefined;
        return {
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          roleLabel: ROLE_LABELS[u.role as Role] ?? u.role,
          active: u.active,
          lastLoginAt: u.lastLoginAt,
          employee: employee
            ? { id: employee._id, namaLengkap: employee.namaLengkap, niy: employee.niy }
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
  },
});

export const roleMatrix = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    return {
      permissions: ALL_PERMISSIONS,
      roles: Object.values(ROLES).map((role) => ({
        role,
        label: ROLE_LABELS[role],
        permissions: ROLE_PERMISSIONS[role],
      })),
    };
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    if (!Object.values(ROLES).includes(args.role as Role)) throw new Error("ROLE_INVALID");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("NOT_FOUND");
    if (user._id === actor.id && args.role !== ROLES.SUPER_ADMIN) {
      throw new Error("Anda tidak dapat menurunkan peran akun sendiri");
    }
    await ctx.db.patch(user._id, {
      role: args.role,
      active: args.active ?? user.active,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, actor, {
      action: AUDIT_ACTION.PERMISSION_CHANGE,
      entity: "user",
      recordId: user._id,
      summary: `Peran ${user.name} diubah dari ${user.role} menjadi ${args.role}`,
      metadata: { dari: user.role, ke: args.role },
    });
    return { ok: true as const };
  },
});

/**
 * Create a user account on behalf of someone.
 *
 * Self-registration at /auth is open to anyone, which is fine for the very
 * first Super Admin but wrong for an institution: HRD must be able to issue
 * accounts directly, with the role and the employee record already decided.
 */
/** Open or close public sign-up at /auth. */
export const setSelfRegistration = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    const existing = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "selfRegistration"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.enabled, updatedAt: Date.now(), updatedBy: user.id });
    } else {
      await ctx.db.insert("settings", {
        key: "selfRegistration",
        value: args.enabled,
        updatedAt: Date.now(),
        updatedBy: user.id,
      });
    }
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "settings",
      summary: args.enabled
        ? "Pendaftaran mandiri dibuka kembali"
        : "Pendaftaran mandiri ditutup — akun hanya dibuat Super Admin",
    });
    return { ok: true as const };
  },
});

export const selfRegistration = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    const row = await ctx.db
      .query("settings")
      .withIndex("key", (q) => q.eq("key", "selfRegistration"))
      .unique();
    return { enabled: row?.value !== false };
  },
});

export const createUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.string(),
    niy: v.optional(v.string()),
    mustChangePassword: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);

    const name = args.name.trim();
    if (!name) throw new Error("NAMA_WAJIB");
    if (!/^\S+@\S+\.\S+$/.test(args.email.trim())) throw new Error("EMAIL_TIDAK_VALID");
    if (args.password.length < 8) throw new Error("PASSWORD_TOO_SHORT");
    if (!Object.values(ROLES).includes(args.role as (typeof ROLES)[keyof typeof ROLES])) {
      throw new Error("PERAN_TIDAK_DIKENAL");
    }

    const email = args.email.trim().toLowerCase();
    if (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique()) {
      throw new Error("EMAIL_TAKEN");
    }

    let employeeId: Id<"employees"> | undefined;
    const niy = args.niy?.trim();
    if (niy) {
      const key = niy.toLowerCase();
      const employee = (await ctx.db.query("employees").collect()).find(
        (candidate) => candidate.niy.trim().toLowerCase() === key,
      );
      if (!employee) throw new Error(`NIY_TIDAK_DITEMUKAN: ${niy} tidak ada di Master Data Karyawan`);
      const owner = (await ctx.db.query("users").collect()).find(
        (candidate) => candidate.employeeId === employee._id,
      );
      if (owner) {
        throw new Error(`NIY_SUDAH_TERTAUT: ${employee.namaLengkap} sudah tertaut ke akun ${owner.name}`);
      }
      employeeId = employee._id;
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name,
      email,
      passwordHash: await hashPassword(args.password),
      role: args.role,
      active: true,
      mustChangePassword: args.mustChangePassword ?? true,
      createdAt: now,
      updatedAt: now,
    });
    if (employeeId) await ctx.db.patch(userId, { employeeId });

    await writeAudit(ctx, actor, {
      action: AUDIT_ACTION.CREATE,
      entity: "user",
      recordId: userId,
      summary: `Pengguna ${name} (${email}) dibuat dengan peran ${args.role}${niy ? ` dan NIY ${niy}` : ""}`,
    });
    return { userId, employeeId: employeeId ?? null };
  },
});

/** Issue a new temporary password (e.g. when an employee forgets theirs). */
export const resetPassword = mutation({
  args: {
    userId: v.id("users"),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    if (args.password.length < 8) throw new Error("PASSWORD_TOO_SHORT");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_TIDAK_DITEMUKAN");
    await ctx.db.patch(args.userId, {
      passwordHash: await hashPassword(args.password),
      mustChangePassword: true,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, actor, {
      action: AUDIT_ACTION.PERMISSION_CHANGE,
      entity: "user",
      recordId: args.userId,
      summary: `Kata sandi sementara untuk ${user.name} dibuat ulang`,
    });
    return { ok: true as const };
  },
});

/**
 * Link an account to an employee by NIY.
 *
 * NIY is the business key of the master data, so it is the identifier the HRD
 * actually has in front of them; picking a name from a dropdown of hundreds of
 * employees is error-prone. The employee must exist and must not already belong
 * to another account.
 */
export const linkUserByNiy = mutation({
  args: {
    userId: v.id("users"),
    niy: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    const niy = args.niy.trim();
    if (!niy) throw new Error("NIY wajib diisi");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_TIDAK_DITEMUKAN");

    const key = niy.toLowerCase();
    const employee = (await ctx.db.query("employees").collect()).find(
      (candidate) => candidate.niy.trim().toLowerCase() === key,
    );
    if (!employee) {
      throw new Error(`NIY_TIDAK_DITEMUKAN: ${niy} tidak ada di Master Data Karyawan`);
    }

    const owner = (await ctx.db.query("users").collect()).find(
      (candidate) =>
        candidate.employeeId === employee._id && candidate._id !== args.userId,
    );
    if (owner) {
      throw new Error(`NIY_SUDAH_TERTAUT: ${employee.namaLengkap} sudah tertaut ke akun ${owner.name}`);
    }

    await ctx.db.patch(args.userId, { employeeId: employee._id, updatedAt: Date.now() });
    await writeAudit(ctx, actor, {
      action: AUDIT_ACTION.PERMISSION_CHANGE,
      entity: "user",
      recordId: args.userId,
      summary: `Akun ${user.name} ditautkan ke karyawan ${employee.namaLengkap} (${employee.niy})`,
    });
    return { ok: true as const, employeeName: employee.namaLengkap, niy: employee.niy };
  },
});

export const linkUserToEmployee = mutation({
  args: {
    userId: v.id("users"),
    employeeId: v.optional(v.union(v.id("employees"), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    await ctx.db.patch(args.userId, {
      employeeId: args.employeeId ?? undefined,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, actor, {
      action: AUDIT_ACTION.PERMISSION_CHANGE,
      entity: "user",
      recordId: args.userId,
      summary: "Akun pengguna ditautkan ke data karyawan",
    });
    return { ok: true as const };
  },
});
