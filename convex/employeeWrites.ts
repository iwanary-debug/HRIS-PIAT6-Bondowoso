/**
 * Employee master — write API.
 * Server-side validation, permission enforcement and audit for every change.
 */

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import { requirePermission } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { calculateAge, calculateTenure, isValidISODate } from "../src/domain/tenure";

const employeeFields = {
  namaLengkap: v.optional(v.string()),
  bidangId: v.optional(v.union(v.id("organizationUnits"), v.null())),
  jabatanId: v.optional(v.union(v.id("positions"), v.null())),
  tanggalLahir: v.optional(v.union(v.string(), v.null())),
  tempatLahir: v.optional(v.union(v.string(), v.null())),
  alamatKtp: v.optional(v.union(v.string(), v.null())),
  nik: v.optional(v.union(v.string(), v.null())),
  noHp: v.optional(v.union(v.string(), v.null())),
  email: v.optional(v.union(v.string(), v.null())),
  tanggalBergabung: v.optional(v.union(v.string(), v.null())),
  statusAkad: v.optional(v.union(v.string(), v.null())),
  durasiKontrak: v.optional(v.union(v.string(), v.null())),
  jtPerpanjanganKontrak: v.optional(v.union(v.string(), v.null())),
  status: v.optional(v.string()),
  tmtResign: v.optional(v.union(v.string(), v.null())),
  bpjsKesehatanNumber: v.optional(v.union(v.string(), v.null())),
  bank: v.optional(v.union(v.string(), v.null())),
  noRekening: v.optional(v.union(v.string(), v.null())),
  statusPernikahan: v.optional(v.union(v.string(), v.null())),
  jumlahAnak: v.optional(v.union(v.number(), v.null())),
  pendidikanTerakhir: v.optional(v.union(v.string(), v.null())),
  universitas: v.optional(v.union(v.string(), v.null())),
  jurusan: v.optional(v.union(v.string(), v.null())),
};

const VALID_STATUS = ["AKTIF", "TIDAK_AKTIF", "RESIGN", "TERMINASI"];
const VALID_AKAD = ["PKWT", "PKWTT"];
const VALID_MARITAL = ["BELUM_MENIKAH", "MENIKAH", "CERAI_HIDUP", "CERAI_MATI"];

export interface ValidationError {
  field: string;
  message: string;
}

export function validateEmployeeInput(
  input: {
    niy?: string;
    namaLengkap?: string;
    nik?: string | null;
    noHp?: string | null;
    email?: string | null;
    tanggalLahir?: string | null;
    tanggalBergabung?: string | null;
    tmtResign?: string | null;
    jtPerpanjanganKontrak?: string | null;
    status?: string;
    statusAkad?: string | null;
    statusPernikahan?: string | null;
    jumlahAnak?: number | null;
  },
  existing?: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const niy = (input.niy ?? (existing?.niy as string) ?? "").trim();
  if (!niy) errors.push({ field: "niy", message: "NIY wajib diisi" });
  if (niy.length > 30) errors.push({ field: "niy", message: "NIY maksimal 30 karakter" });
  if (!/^[A-Za-z0-9._/-]+$/.test(niy)) {
    errors.push({
      field: "niy",
      message: "NIY hanya boleh berisi huruf, angka, titik, garis, garis miring",
    });
  }

  const name = (input.namaLengkap ?? (existing?.namaLengkap as string) ?? "").trim();
  if (!name) errors.push({ field: "namaLengkap", message: "Nama Lengkap wajib diisi" });
  if (name.length < 2) errors.push({ field: "namaLengkap", message: "Nama terlalu pendek" });

  const nik = input.nik ?? (existing?.nik as string | undefined);
  if (nik && nik.replace(/\D/g, "").length !== 16) {
    errors.push({ field: "nik", message: "NIK harus 16 digit" });
  }
  const noHp = input.noHp ?? (existing?.noHp as string | undefined);
  if (noHp) {
    const digits = noHp.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      errors.push({ field: "noHp", message: "Nomor HP harus 8–15 digit" });
    }
  }
  const email = input.email ?? (existing?.email as string | undefined);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: "email", message: "Format email tidak valid" });
  }

  for (const [field, value] of [
    ["tanggalLahir", input.tanggalLahir],
    ["tanggalBergabung", input.tanggalBergabung],
    ["tmtResign", input.tmtResign],
    ["jtPerpanjanganKontrak", input.jtPerpanjanganKontrak],
  ] as const) {
    if (value && !isValidISODate(value)) {
      errors.push({ field, message: "Tanggal harus format yyyy-mm-dd dan valid" });
    }
  }

  const birth = input.tanggalLahir ?? (existing?.tanggalLahir as string | undefined);
  if (birth && calculateAge(birth) !== undefined && calculateAge(birth)! > 70) {
    errors.push({ field: "tanggalLahir", message: "Usia melebihi 70 tahun — periksa kembali" });
  }
  const join = input.tanggalBergabung ?? (existing?.tanggalBergabung as string | undefined);
  if (birth && join && join < birth) {
    errors.push({
      field: "tanggalBergabung",
      message: "Tanggal bergabung tidak boleh lebih awal dari tanggal lahir",
    });
  }

  const status = input.status ?? (existing?.status as string) ?? "AKTIF";
  if (!VALID_STATUS.includes(status)) {
    errors.push({ field: "status", message: "Status tidak valid" });
  }
  const akad = input.statusAkad ?? (existing?.statusAkad as string | undefined);
  if (akad && !VALID_AKAD.includes(akad)) {
    errors.push({ field: "statusAkad", message: "Status Akad harus PKWT atau PKWTT" });
  }
  const marital = input.statusPernikahan ?? (existing?.statusPernikahan as string | undefined);
  if (marital && !VALID_MARITAL.includes(marital)) {
    errors.push({ field: "statusPernikahan", message: "Status pernikahan tidak valid" });
  }
  const children = input.jumlahAnak ?? (existing?.jumlahAnak as number | undefined);
  if (children !== undefined && children !== null && (children < 0 || children > 20)) {
    errors.push({ field: "jumlahAnak", message: "Jumlah anak harus antara 0 dan 20" });
  }
  return errors;
}

/** Keep the denormalised masa kerja column in sync with the join date. */
export function derivedTenure(joinDate: string | undefined, reference = new Date()) {
  return calculateTenure(joinDate, reference)?.label;
}

export const create = mutation({
  args: { niy: v.string(), ...employeeFields },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_CREATE);
    const niy = args.niy.trim();
    const errors = validateEmployeeInput({ ...args, niy });
    if (errors.length) return { ok: false as const, errors };

    const duplicate = await ctx.db
      .query("employees")
      .withIndex("niy", (q) => q.eq("niy", niy))
      .unique();
    if (duplicate) {
      return {
        ok: false as const,
        errors: [
          { field: "niy", message: `NIY ${niy} sudah digunakan oleh ${duplicate.namaLengkap}` },
        ],
      };
    }

    const now = Date.now();
    const employeeId = await ctx.db.insert("employees", {
      niy,
      namaLengkap: args.namaLengkap!.trim(),
      bidangId: args.bidangId ?? undefined,
      jabatanId: args.jabatanId ?? undefined,
      tanggalLahir: args.tanggalLahir ?? undefined,
      tempatLahir: args.tempatLahir ?? undefined,
      alamatKtp: args.alamatKtp ?? undefined,
      nik: args.nik ?? undefined,
      noHp: args.noHp ?? undefined,
      email: args.email ?? undefined,
      tanggalBergabung: args.tanggalBergabung ?? undefined,
      masaKerja: derivedTenure(args.tanggalBergabung ?? undefined),
      statusAkad: args.statusAkad ?? "PKWT",
      durasiKontrak: args.durasiKontrak ?? undefined,
      jtPerpanjanganKontrak: args.jtPerpanjanganKontrak ?? undefined,
      status: args.status ?? "AKTIF",
      tmtResign: args.tmtResign ?? undefined,
      bpjsKesehatanNumber: args.bpjsKesehatanNumber ?? undefined,
      bank: args.bank ?? undefined,
      noRekening: args.noRekening ?? undefined,
      statusPernikahan: args.statusPernikahan ?? undefined,
      jumlahAnak: args.jumlahAnak ?? undefined,
      pendidikanTerakhir: args.pendidikanTerakhir ?? undefined,
      universitas: args.universitas ?? undefined,
      jurusan: args.jurusan ?? undefined,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "employee",
      recordId: employeeId,
      summary: `Karyawan baru ${args.namaLengkap} (${niy}) ditambahkan`,
      fields: ["namaLengkap", "status", "statusAkad", "bidangId", "jabatanId"],
    });

    return { ok: true as const, employeeId };
  },
});

export const update = mutation({
  args: { id: v.id("employees"), niy: v.optional(v.string()), ...employeeFields },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_EDIT);
    const employee = await ctx.db.get(args.id);
    if (!employee)    return { ok: false as const, errors: [{ field: "id", message: "Karyawan tidak ditemukan" }] };

    // Editing sensitive values requires the sensitive permission, not just edit.
    const touchesSensitive =
      args.nik !== undefined ||
      args.noRekening !== undefined ||
      args.bpjsKesehatanNumber !== undefined ||
      args.alamatKtp !== undefined;
    if (touchesSensitive && !user.permissions.includes(PERMISSIONS.HR_SENSITIVE_VIEW)) {
      return {
        ok: false as const,
        errors: [{ field: "nik", message: "HR_SENSITIVE_VIEW diperlukan untuk mengubah data sensitif" }],
      };
    }

    const niy = args.niy?.trim() ?? employee.niy;
    const errors = validateEmployeeInput({ ...args, niy }, employee);
    if (errors.length) return { ok: false as const, errors };

    if (niy !== employee.niy) {
      const duplicate = await ctx.db
        .query("employees")
        .withIndex("niy", (q) => q.eq("niy", niy))
        .unique();
      if (duplicate) {
        return {
          ok: false as const,
          errors: [{ field: "niy", message: `NIY ${niy} sudah digunakan oleh ${duplicate.namaLengkap}` }],
        };
      }
    }

    const joinDate = args.tanggalBergabung === undefined ? employee.tanggalBergabung : args.tanggalBergabung;
    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: user.id };
    for (const key of Object.keys(employeeFields) as (keyof typeof employeeFields)[]) {
      const value = args[key];
      if (value === undefined) continue;
      if (value === null) patch[key] = undefined;
      else patch[key] = value;
    }
    if (args.niy !== undefined) patch.niy = niy;
    if (joinDate !== undefined) patch.masaKerja = derivedTenure(joinDate ?? undefined);

    await ctx.db.patch(employee._id, patch);
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.UPDATE,
      entity: "employee",
      recordId: employee._id,
      before: employee as unknown as Record<string, unknown>,
      after: { ...employee, ...patch } as unknown as Record<string, unknown>,
      fields: [
        "niy",
        "namaLengkap",
        "status",
        "statusAkad",
        "bidangId",
        "jabatanId",
        "tanggalBergabung",
        "tmtResign",
        "pendidikanTerakhir",
        "universitas",
        "jurusan",
        "nik",
        "bpjsKesehatanNumber",
        "noRekening",
        "alamatKtp",
        "noHp",
        "email",
      ],
      summary: `Data karyawan ${employee.namaLengkap} (${employee.niy}) diperbarui`,
    });
    return { ok: true as const, employeeId: employee._id };
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("employees"),
    status: v.string(),
    tmtResign: v.optional(v.union(v.string(), v.null())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const isTermination = ["RESIGN", "TERMINASI"].includes(args.status);
    const permission = isTermination
      ? PERMISSIONS.HR_EDIT
      : args.status === "AKTIF"
        ? PERMISSIONS.HR_EDIT
        : PERMISSIONS.HR_DELETE;
    const user = await requirePermission(ctx, permission);
    const employee = await ctx.db.get(args.id);
    if (!employee) throw new Error("NOT_FOUND");
    if (!VALID_STATUS.includes(args.status)) throw new Error("INVALID_STATUS");

    await ctx.db.patch(employee._id, {
      status: args.status,
      tmtResign: args.tmtResign ?? employee.tmtResign,
      updatedAt: Date.now(),
      updatedBy: user.id,
    });

    const action = args.status === "AKTIF" ? AUDIT_ACTION.REACTIVATE : AUDIT_ACTION.DEACTIVATE;
    await writeAudit(ctx, user, {
      action,
      entity: "employee",
      recordId: employee._id,
      summary: `${employee.namaLengkap} (${employee.niy}) diubah dari ${employee.status} menjadi ${args.status}`,
      metadata: { dari: employee.status, ke: args.status, alasan: args.reason ?? "-" },
    });

    // Exiting staff must not keep an open attendance/leave pipeline.
    if (args.status !== "AKTIF") {
      const openLeave = await ctx.db
        .query("leaveRequests")
        .withIndex("employeeId", (q) => q.eq("employeeId", employee._id))
        .filter((q) => q.or(q.eq(q.field("status"), "PENDING"), q.eq(q.field("status"), "APPROVED")))
        .collect();
      for (const leave of openLeave) {
        if (leave.status === "PENDING") {
          await ctx.db.patch(leave._id, { status: "CANCELLED", decisionNote: "Karyawan tidak aktif" });
        }
      }
    }
    return { ok: true as const };
  },
});

/** Soft guard: employee records are never hard-deleted, only deactivated. */
export const hardDeleteBlocked = mutation({
  args: { id: v.id("employees") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_DELETE);
    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.DELETE,
      entity: "employee",
      recordId: args.id,
      summary:
        "Permintaan hapus permanen ditolak sistem — gunakan Deactivate agar histori tetap tersimpan",
    });
    throw new Error("DELETE_BLOCKED: Gunakan Deactivate agar histori karyawan tetap tersimpan");
  },
});
