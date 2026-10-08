/**
 * Employee master domain.
 *
 * Field naming follows the source workbook `Master data karyawan.xlsx`
 * (sheet `Data Master Karyawan`) so imports and exports round-trip losslessly.
 * Derived values (age, tenure) are ALWAYS computed from dates, never trusted
 * from a spreadsheet cell.
 */

export const EMPLOYEE_STATUS = {
  AKTIF: "AKTIF",
  TIDAK_AKTIF: "TIDAK_AKTIF",
  RESIGN: "RESIGN",
  TERMINASI: "TERMINASI",
} as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUS)[keyof typeof EMPLOYEE_STATUS];

export const EMPLOYEE_STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: "AKTIF", label: "Aktif" },
  { value: "TIDAK_AKTIF", label: "Tidak Aktif" },
  { value: "RESIGN", label: "Resign" },
  { value: "TERMINASI", label: "Terminasi" },
];

export const STATUS_AKAD = { PKWT: "PKWT", PKWTT: "PKWTT" } as const;
export type StatusAkad = (typeof STATUS_AKAD)[keyof typeof STATUS_AKAD];
export const STATUS_AKAD_OPTIONS: { value: StatusAkad; label: string }[] = [
  { value: "PKWT", label: "PKWT (Waktu Tertentu)" },
  { value: "PKWTT", label: "PKWTT (Waktu Tidak Tertentu)" },
];

export const MARITAL_STATUS = {
  BELUM_MENIKAH: "BELUM_MENIKAH",
  MENIKAH: "MENIKAH",
  CERAI_HIDUP: "CERAI_HIDUP",
  CERAI_MATI: "CERAI_MATI",
} as const;
export type MaritalStatus = (typeof MARITAL_STATUS)[keyof typeof MARITAL_STATUS];
export const MARITAL_STATUS_OPTIONS: { value: MaritalStatus; label: string }[] = [
  { value: "BELUM_MENIKAH", label: "Belum Menikah" },
  { value: "MENIKAH", label: "Menikah" },
  { value: "CERAI_HIDUP", label: "Cerai Hidup" },
  { value: "CERAI_MATI", label: "Cerai Mati" },
];

export const PENDIDIKAN_TERAKHIR = [
  "SD/SMP",
  "SMA/SMK",
  "D1/D2/D3",
  "S1",
  "S2",
  "S3",
] as const;
export type PendidikanTerakhir = (typeof PENDIDIKAN_TERAKHIR)[number];

/** Employee master record. One row of the source workbook, normalised. */
export interface Employee {
  /** Convex document id. */
  _id: string;
  /** Business identifier. Unique, required, never the name. */
  niy: string;
  namaLengkap: string;
  /** Reference to organizationUnits(_id). */
  bidangId?: string;
  bidang?: string;
  /** Reference to positions(_id). */
  jabatanId?: string;
  jabatan?: string;

  tanggalLahir?: string; // ISO yyyy-mm-dd
  tempatLahir?: string;
  /** Kab./Kota only, per source workbook. Sensitive. */
  alamatKtp?: string;
  /** Sensitive. */
  nik?: string;
  noHp?: string;
  email?: string;
  fotoUrl?: string;

  tanggalBergabung?: string;
  masaKerja?: string;
  statusAkad?: StatusAkad;
  durasiKontrak?: string;
  jtPerpanjanganKontrak?: string;
  status: EmployeeStatus;
  tmtResign?: string;

  bpjsKesehatanNumber?: string;
  bpjsKetenagakerjaanNumber?: string;
  bank?: string;
  noRekening?: string;

  statusPernikahan?: MaritalStatus;
  jumlahAnak?: number;
  pendidikanTerakhir?: PendidikanTerakhir | string;
  universitas?: string;
  jurusan?: string;

  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
}

/** Fields safe to list in the general employee table and exports. */
export const EMPLOYEE_LIST_COLUMNS = [
  "niy",
  "namaLengkap",
  "bidang",
  "jabatan",
  "status",
  "statusAkad",
  "masaKerja",
  "kontak",
] as const;
