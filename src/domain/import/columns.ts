/**
 * Import Karyawan — canonical column catalogue.
 *
 * Mirrors the 26 meaningful columns of `Master data karyawan.xlsx` sheet
 * `Data Master Karyawan`. Aliases let the auto-mapper match the real workbook
 * header even when it contains trailing spaces, punctuation or numbering.
 */

export type SourceColumnKey =
  | "niy"
  | "namaLengkap"
  | "bidang"
  | "jabatan"
  | "tanggalLahir"
  | "usia"
  | "tanggalBergabung"
  | "masaKerja"
  | "statusAkad"
  | "durasiKontrak"
  | "jtPerpanjanganKontrak"
  | "status"
  | "tmtResign"
  | "noHp"
  | "email"
  | "tempatLahir"
  | "alamatKtp"
  | "nik"
  | "bpjsKesehatanNumber"
  | "bank"
  | "noRekening"
  | "statusPernikahan"
  | "jumlahAnak"
  | "pendidikanTerakhir"
  | "universitas"
  | "jurusan";

export type SourceColumnType = "string" | "number" | "date" | "enum";

export interface SourceColumn {
  key: SourceColumnKey;
  /** Position in the source workbook (1-based). */
  index: number;
  label: string;
  type: SourceColumnType;
  required: boolean;
  /** Sensitive columns are masked in previews and never written to audit logs. */
  sensitive: boolean;
  /** Header aliases used by the auto-mapper. */
  aliases: string[];
  enumValues?: readonly string[];
  hint?: string;
}

const t = <K extends SourceColumnKey>(
  key: K,
  index: number,
  label: string,
  type: SourceColumnType,
  required: boolean,
  sensitive: boolean,
  aliases: string[],
  extra: Partial<SourceColumn> = {},
): SourceColumn => ({ key, index, label, type, required, sensitive, aliases, ...extra });

export const SOURCE_COLUMNS: SourceColumn[] = [
  t("niy", 1, "NIY", "string", true, false, ["niy", "nomor induk karyawan", "no induk", "id karyawan"]),
  t("namaLengkap", 2, "Nama Lengkap", "string", true, false, ["nama lengkap", "nama", "name"]),
  t("bidang", 3, "Bidang", "string", false, false, ["bidang", "unit", "unit kerja", "divisi"]),
  t("jabatan", 4, "Jabatan", "string", false, false, ["jabatan", "jabatan utama", "posisi", "position"]),
  t("tanggalLahir", 5, "Tanggal Lahir", "date", false, true, ["tanggal lahir", "tgl lahir", "tanggal_lahir", "ttl"], { hint: "dd/mm/yyyy atau yyyy-mm-dd" }),
  t("usia", 6, "Usia", "number", false, false, ["usia", "umur", "age"], { hint: "Dihitung ulang dari Tanggal Lahir" }),
  t("tanggalBergabung", 7, "Tanggal Bergabung", "date", false, false, ["tanggal bergabung", "tgl bergabung", "tanggal masuk", "tmt"]),
  t("masaKerja", 8, "Masa Kerja", "string", false, false, ["masa kerja", "masa_kerja", "tenure"], { hint: "Dihitung ulang dari Tanggal Bergabung" }),
  t("statusAkad", 9, "Status Akad", "enum", false, false, ["status akad", "statusakad", "akad", "jenis kontrak"], { enumValues: ["PKWT", "PKWTT"] }),
  t("durasiKontrak", 10, "Durasi Kontrak", "string", false, false, ["durasi kontrak", "durasi", "masa kontrak"]),
  t("jtPerpanjanganKontrak", 11, "JT. Perpanjangan Kontrak", "date", false, false, ["jt. perpanjangan kontrak", "jt perpanjangan kontrak", "jatuh tempo kontrak", "tanggal berakhir kontrak"]),
  t("status", 12, "Status", "enum", false, false, ["status", "status karyawan", "status kepegawaian"], { enumValues: ["AKTIF", "TIDAK_AKTIF", "RESIGN", "TERMINASI"] }),
  t("tmtResign", 13, "TMT Resign", "date", false, false, ["tmt resign", "tgl resign", "tanggal resign", "tmt"]),
  t("noHp", 14, "No HP", "string", false, true, ["no hp", "nohp", "no. hp", "telepon", "hp", "phone"]),
  t("email", 15, "Email", "string", false, true, ["email", "e-mail", "surel"]),
  t("tempatLahir", 16, "Tempat Lahir", "string", false, false, ["tempat lahir", "tempat_lahir", "tempat"]),
  t("alamatKtp", 17, "Alamat KTP", "string", false, true, ["alamat ktp", "alamat", "kab/kota", "kabupaten/kota"]),
  t("nik", 18, "NIK", "string", false, true, ["nik", "no nik", "no. nik", "ktp"]),
  t("bpjsKesehatanNumber", 19, "No. BPJS Kesehatan", "string", false, true, ["no. bpjs kesehatan", "bpjs kesehatan", "no bpjs", "bpjs"]),
  t("bank", 20, "Bank", "string", false, false, ["bank", "nama bank"]),
  t("noRekening", 21, "No. Rekening", "string", false, true, ["no. rekening", "no rekening", "rekening", "nomor rekening"]),
  t("statusPernikahan", 22, "Status Pernikahan", "enum", false, false, ["status pernikahan", "status perkawinan", "pernikahan"], { enumValues: ["BELUM_MENIKAH", "MENIKAH", "CERAI_HIDUP", "CERAI_MATI"] }),
  t("jumlahAnak", 23, "Jumlah Anak", "number", false, false, ["jumlah anak", "jml anak", "anak"]),
  t("pendidikanTerakhir", 24, "Pendidikan Terakhir", "string", false, false, ["pendidikan terakhir", "pendidikan", "jenjang pendidikan"]),
  t("universitas", 25, "Universitas", "string", false, false, ["universitas", "institusi", "sekolah tinggi", "kampus"]),
  t("jurusan", 26, "Jurusan", "string", false, false, ["jurusan", "prodi", "program studi", "bidang studi"]),
];

export const SOURCE_COLUMN_KEYS = SOURCE_COLUMNS.map((column) => column.key);

export const SOURCE_COLUMN_BY_KEY: Record<SourceColumnKey, SourceColumn> = Object.fromEntries(
  SOURCE_COLUMNS.map((column) => [column.key, column]),
) as Record<SourceColumnKey, SourceColumn>;

/** Column used as the unique business identifier during import. */
export const BUSINESS_KEY: SourceColumnKey = "niy";

/** Default source sheet in the real workbook. */
export const DEFAULT_SOURCE_SHEET = "Data Master Karyawan";
