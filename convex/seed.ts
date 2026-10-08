/**
 * Reference-data bootstrap.
 *
 * Seeds only REFERENCE data (units, positions, payroll components,
 * competencies, performance indicators) and institution settings — never
 * employee personal data. The fictional sample employees are loaded through
 * the real Import Karyawan pipeline from `public/sample-data/employees.csv`,
 * exactly like a production workbook would be.
 *
 * Idempotent: running it twice does not duplicate anything.
 */

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { PERMISSIONS } from "../src/domain/permissions";
import {
  REFERENCED_BIDANG,
  REFERENCED_JABATAN,
} from "../src/domain/organization";
import { requirePermission } from "./lib/auth";

/** Default payroll components — deliberately neutral, no statutory rules. */
const DEFAULT_COMPONENTS = [
  {
    code: "GAJI_POKOK",
    name: "Gaji Pokok",
    kind: "EARNING",
    calculation: "FIXED",
    value: 0,
    taxable: true,
    description: "Nilai tetap per karyawan, diatur pada Struktur Gaji.",
  },
  {
    code: "TUNJANGAN_FUNGSIONAL",
    name: "Tunjangan Fungsional",
    kind: "EARNING",
    calculation: "FIXED",
    value: 0,
    taxable: true,
    description: "Disesuaikan per jabatan; nominal belum ditentukan HRD.",
  },
  {
    code: "TUNJANGAN_ANAK",
    name: "Tunjangan Anak",
    kind: "EARNING",
    calculation: "PERCENTAGE_OF_COMPONENT",
    basedOnCode: "TUNJANGAN_FUNGSIONAL",
    value: 10,
    taxable: true,
    description: "Contoh konfigurasi 10% dari tunjangan fungsional. Sesuaikan dengan kebijakan HRD.",
  },
  {
    code: "BPJS_KESEHATAN",
    name: "Potongan BPJS Kesehatan",
    kind: "DEDUCTION",
    calculation: "PERCENTAGE_OF_BASE",
    value: 0,
    taxable: false,
    description: "Persentase belum ditentukan — isi setelah aturan resmi diterima HRD.",
  },
  {
    code: "BPJS_KETENAGAKERJAAN",
    name: "Potongan BPJS Ketenagakerjaan",
    kind: "DEDUCTION",
    calculation: "PERCENTAGE_OF_BASE",
    value: 0,
    taxable: false,
    description: "Persentase belum ditentukan — isi setelah aturan resmi diterima HRD.",
  },
] as const;

const DEFAULT_COMPETENCIES = [
  { name: "Mengajar Bahasa Arab", category: "Akademik" },
  { name: "Pembinaan Santri", category: "Kependidikan" },
  { name: "Manajemen Kelas", category: "Akademik" },
  { name: "Administrasi Surat", category: "Administrasi" },
  { name: "Keuangan & Akuntansi", category: "Keuangan" },
  { name: "Pelayanan Santri", category: "Pelayanan" },
  { name: "Kepemimpinan", category: "Manajerial" },
  { name: "Penggunaan TI", category: "Kompetensi Umum" },
];

const DEFAULT_INDICATORS = [
  { name: "Ketepatan Pelaksanaan Tugas", type: "SCORE", weight: 30, description: "Tepat waktu dan lengkap dalam menjalankan tugas." },
  { name: "Kualitas Hasil Kerja", type: "SCORE", weight: 30, description: "Mutu dan ketepatan hasil pekerjaan." },
  { name: "Disiplin dan Kehadiran", type: "PERCENTAGE", weight: 20, description: "Tingkat kehadiran dan kepatuhan terhadap aturan." },
  { name: "Kerja Sama Tim", type: "SCORE", weight: 20, description: "Kolaborasi dengan rekan kerja dan atasan." },
];

export const status = query({
  args: {},
  handler: async (ctx) => {
    const [units, positions, components, competencies, indicators, users] = await Promise.all([
      ctx.db.query("organizationUnits").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("payrollComponents").collect(),
      ctx.db.query("competencies").collect(),
      ctx.db.query("performanceIndicators").collect(),
      ctx.db.query("users").collect(),
    ]);
    const employees = await ctx.db.query("employees").collect();
    return {
      units: units.length,
      positions: positions.length,
      components: components.length,
      competencies: competencies.length,
      indicators: indicators.length,
      employees: employees.length,
      users: users.length,
      ready:
        units.length > 0 &&
        positions.length > 0 &&
        components.length > 0 &&
        indicators.length > 0,
    };
  },
});

export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_SETTINGS);
    const now = Date.now();
    const report = { units: 0, positions: 0, components: 0, competencies: 0, indicators: 0 };

    // ── Organization units (bidang) ───────────────────────────────────
    const existingUnits = await ctx.db.query("organizationUnits").collect();
    const unitByName = new Map(existingUnits.map((u) => [u.nama.toLowerCase(), u._id]));
    const unitIds: Record<string, Id<"organizationUnits">> = {};
    for (const [index, name] of REFERENCED_BIDANG.entries()) {
      const existing = unitByName.get(name.toLowerCase());
      if (existing) {
        unitIds[name] = existing;
        continue;
      }
      unitIds[name] = await ctx.db.insert("organizationUnits", {
        kode: `U${String(index + 1).padStart(2, "0")}`,
        nama: name,
        type: "BIDANG",
        keterangan: "Bidang dari master data karyawanPIAT 6",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      report.units += 1;
    }

    // ── Positions (jabatan) ────────────────────────────────────────────
    const existingPositions = await ctx.db.query("positions").collect();
    const positionByName = new Map(existingPositions.map((p) => [p.nama.toLowerCase(), p._id]));
    const structural = new Set(["MUDIR", "KABID. RUMAH TANGGA", "KAMAD IM", "KAMAD. MTW", "KABID. KEPENGASUHAN", "KABID. KEUANGAN & SDM", "WAKA KURIKULUM IM", "WAKA KURIKULUM MTW", "SEKRETARIS MUDIR", "WAKA. KESISWAAN"]);

    for (const [index, name] of REFERENCED_JABATAN.entries()) {
      if (positionByName.has(name.toLowerCase())) continue;
      await ctx.db.insert("positions", {
        kode: `P${String(index + 1).padStart(3, "0")}`,
        nama: name,
        level: structural.has(name) ? "STRUKTURAL" : "PELAKSANA",
        isStructural: structural.has(name),
        unitId: unitForPosition(name, unitIds),
        keterangan: "Jabatan dari referensi master data karyawan",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      report.positions += 1;
    }

    // ── Reporting lines for the structural positions ──────────────────
    const positions = await ctx.db.query("positions").collect();
    const byName = new Map(positions.map((p) => [p.nama, p._id]));
    const reportingLines: [string, string][] = [
      ["KABID. RUMAH TANGGA", "MUDIR"],
      ["KABID. KEPENGASUHAN", "MUDIR"],
      ["KABID. KEUANGAN & SDM", "MUDIR"],
      ["KAMAD IM", "MUDIR"],
      ["KAMAD. MTW", "MUDIR"],
      ["SEKRETARIS MUDIR", "MUDIR"],
      ["WAKA KURIKULUM IM", "KAMAD IM"],
      ["WAKA KURIKULUM MTW", "KAMAD. MTW"],
      ["WAKA. KESISWAAN", "KABID. KEPENGASUHAN"],
    ];
    for (const [sub, main] of reportingLines) {
      const child = byName.get(sub);
      const parent = byName.get(main);
      if (!child || !parent) continue;
      const current = positions.find((p) => p._id === child);
      if (current && !current.reportsToPositionId) {
        await ctx.db.patch(child, { reportsToPositionId: parent, updatedAt: now });
      }
    }

    // ── Payroll components ────────────────────────────────────────────
    const components = await ctx.db.query("payrollComponents").collect();
    const componentCodes = new Set(components.map((c) => c.code));
    for (const [index, component] of DEFAULT_COMPONENTS.entries()) {
      if (componentCodes.has(component.code)) continue;
      await ctx.db.insert("payrollComponents", {
        ...component,
        active: true,
        order: index,
        createdAt: now,
        updatedAt: now,
      });
      report.components += 1;
    }

    // ── Competency master ─────────────────────────────────────────────
    const competencies = await ctx.db.query("competencies").collect();
    const competencyNames = new Set(competencies.map((c) => c.name));
    for (const competency of DEFAULT_COMPETENCIES) {
      if (competencyNames.has(competency.name)) continue;
      await ctx.db.insert("competencies", { ...competency, active: true, createdAt: now, updatedAt: now });
      report.competencies += 1;
    }

    // ── Performance indicators ────────────────────────────────────────
    const indicators = await ctx.db.query("performanceIndicators").collect();
    if (indicators.length === 0) {
      for (const indicator of DEFAULT_INDICATORS) {
        await ctx.db.insert("performanceIndicators", {
          ...indicator,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        report.indicators += 1;
      }
    }

    // ── Institution + attendance settings ──────────────────────────────
    if (!(await ctx.db.query("settings").withIndex("key", (q) => q.eq("key", "institution")).unique())) {
      await ctx.db.insert("settings", {
        key: "institution",
        value: {
          name: "Pesantren Islam Al Irsyad Tengaran 6 Bondowoso",
          subtitle: "Human Resources Information System",
        },
        updatedAt: now,
      });
    }
    if (!(await ctx.db.query("settings").withIndex("key", (q) => q.eq("key", "attendance")).unique())) {
      await ctx.db.insert("settings", {
        key: "attendance",
        value: { workStart: "07:00", workEnd: "15:00", lateThreshold: 15 },
        updatedAt: now,
      });
    }

    return report;
  },
});

function unitForPosition(
  name: string,
  unitIds: Record<string, Id<"organizationUnits">>,
): Id<"organizationUnits"> | undefined {
  if (name.includes("RUMAH TANGGA")) return unitIds["Rumah Tangga"];
  if (name.includes("KEUANGAN") || name.includes("SDM") || name.includes("KASIR")) return unitIds["Keuangan SDM"];
  if (name.includes("KEPENGASUHAN") || name.includes("KESISWAAN")) return unitIds["Kepengasuhan"];
  if (name.includes("KAMAD") || name.includes("KURIKULUM") || name.includes("GURU") || name.includes("MUDIR")) {
    return unitIds["Madrasah"];
  }
  return unitIds["Madrasah"];
}

export { DEFAULT_INDICATORS };
