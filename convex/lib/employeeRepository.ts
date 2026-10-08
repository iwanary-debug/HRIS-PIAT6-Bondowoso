/**
 * Employee repository — the ONLY place that reads/writes the `employees` table.
 *
 * The service layer above (convex/employees.ts) never touches `ctx.db` for
 * employee data directly, so swapping Convex for Cloudflare D1 or the PIAT 6
 * Super App store only means reimplementing this file.
 */

import type { Doc, Id } from "../_generated/dataModel";
import { calculateAge, calculateTenure, toISODate } from "../../src/domain/tenure";

export type EmployeeDoc = Doc<"employees">;
export type EmployeeId = Id<"employees">;

export const SENSITIVE_EMPLOYEE_FIELDS = [
  "nik",
  "bpjsKesehatanNumber",
  "noRekening",
  "alamatKtp",
  "noHp",
  "email",
  "tempatLahir",
] as const;

export type SensitiveEmployeeField = (typeof SENSITIVE_EMPLOYEE_FIELDS)[number];

/** Shape returned to clients. Sensitive keys are present but masked. */
export interface EmployeeProjection {
  _id: string;
  _creationTime: number;
  niy: string;
  namaLengkap: string;
  bidangId?: string;
  jabatanId?: string;
  bidang?: string;
  jabatan?: string;
  tanggalLahir?: string;
  tempatLahir?: string;
  alamatKtp?: string;
  nik?: string;
  noHp?: string;
  email?: string;
  fotoUrl?: string;
  tanggalBergabung?: string;
  masaKerja?: string;
  statusAkad?: string;
  durasiKontrak?: string;
  jtPerpanjanganKontrak?: string;
  status: string;
  tmtResign?: string;
  bpjsKesehatanNumber?: string;
  bank?: string;
  noRekening?: string;
  statusPernikahan?: string;
  jumlahAnak?: number;
  pendidikanTerakhir?: string;
  universitas?: string;
  jurusan?: string;
  /** Derived — never stored from a spreadsheet. */
  usia?: number;
  masaKerjaLabel?: string;
  createdAt: number;
  updatedAt: number;
  /** True when the projection omitted sensitive values. */
  redacted: boolean;
}

const MASK = "••••••";

export interface ProjectOptions {
  includeSensitive: boolean;
  unitNames?: Map<string, string>;
  positionNames?: Map<string, string>;
  reference?: Date;
}

/**
 * Project an employee document for the client. Without HR_SENSITIVE_VIEW the
 * sensitive values are dropped entirely rather than sent and hidden in CSS.
 */
export function projectEmployee(
  employee: EmployeeDoc,
  options: ProjectOptions,
): EmployeeProjection {
  const reference = options.reference ?? new Date();
  const age = calculateAge(employee.tanggalLahir, reference);
  const tenure = calculateTenure(employee.tanggalBergabung, reference);
  const include = options.includeSensitive;

  return {
    _id: employee._id,
    _creationTime: employee._creationTime,
    niy: employee.niy,
    namaLengkap: employee.namaLengkap,
    bidangId: employee.bidangId,
    jabatanId: employee.jabatanId,
    bidang: employee.bidangId ? options.unitNames?.get(employee.bidangId) : undefined,
    jabatan: employee.jabatanId ? options.positionNames?.get(employee.jabatanId) : undefined,
    tanggalLahir: employee.tanggalLahir,
    tempatLahir: include ? employee.tempatLahir : undefined,
    alamatKtp: include ? employee.alamatKtp : undefined,
    nik: include ? employee.nik : undefined,
    noHp: include ? employee.noHp : undefined,
    email: include ? employee.email : undefined,
    fotoUrl: employee.fotoUrl,
    tanggalBergabung: employee.tanggalBergabung,
    masaKerja: employee.masaKerja,
    statusAkad: employee.statusAkad,
    durasiKontrak: employee.durasiKontrak,
    jtPerpanjanganKontrak: employee.jtPerpanjanganKontrak,
    status: employee.status,
    tmtResign: employee.tmtResign,
    bpjsKesehatanNumber: include ? employee.bpjsKesehatanNumber : undefined,
    bank: employee.bank,
    noRekening: include ? employee.noRekening : undefined,
    statusPernikahan: employee.statusPernikahan,
    jumlahAnak: employee.jumlahAnak,
    pendidikanTerakhir: employee.pendidikanTerakhir,
    universitas: employee.universitas,
    jurusan: employee.jurusan,
    usia: age,
    masaKerjaLabel: tenure?.label ?? employee.masaKerja,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
    redacted: !include,
  };
}

/** Partial projection for list views: no sensitive data at all, not even masked. */
export function projectEmployeeSummary(
  employee: EmployeeDoc,
  options: Omit<ProjectOptions, "includeSensitive"> & { includeContact: boolean },
): Omit<EmployeeProjection, "tempatLahir" | "alamatKtp" | "nik" | "noRekening" | "bpjsKesehatanNumber"> {
  const full = projectEmployee(employee, {
    ...options,
    includeSensitive: options.includeContact,
  });
  const {
    tempatLahir: _tempatLahir,
    alamatKtp: _alamatKtp,
    nik: _nik,
    noRekening: _noRekening,
    bpjsKesehatanNumber: _bpjs,
    ...rest
  } = full;
  return rest;
}

export { MASK, calculateAge, calculateTenure, toISODate };
