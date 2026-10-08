/**
 * Report center.
 * Every report is a server-side query so the permission check happens before
 * any data is returned; the client only formats CSV/XLSX.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import { calculateAge, calculateTenure } from "../src/domain/tenure";
import { evaluateContractStatus } from "../src/domain/contract";
import { buildMonth, summarizeAttendance } from "../src/domain/attendance";
import { EDUCATION_LEVEL_OPTIONS, performanceGrade } from "../src/domain/development";
import { clearanceProgress } from "../src/domain/lifecycle";
import { hasPermission, requirePermission, requireUser } from "./lib/auth";

export const reportCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return [
      { key: "employee-list", title: "Daftar Karyawan", group: "Data SDM", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "by-bidang", title: "Karyawan per Bidang", group: "Data SDM", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "by-jabatan", title: "Karyawan per Jabatan", group: "Data SDM", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "by-status", title: "Status Aktif / Nonaktif", group: "Data SDM", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "by-akad", title: "PKWT / PKWTT", group: "Data SDM", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "by-tenure", title: "Masa Kerja", group: "Data SDM", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "by-education", title: "Pendidikan", group: "Data SDM", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "by-marital", title: "Status Pernikahan", group: "Data SDM", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "contracts", title: "Kontrak", group: "Kepegawaian", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "attendance", title: "Kehadiran", group: "Operasional", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "leave", title: "Cuti & Izin", group: "Operasional", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "training", title: "Pelatihan", group: "Pengembangan", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "performance", title: "Penilaian Kinerja", group: "Pengembangan", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "mutation", title: "Mutasi / Promosi", group: "Karier", permission: PERMISSIONS.HR_REPORT_VIEW },
      { key: "resignation", title: "Resign / Terminasi", group: "Karier", permission: PERMISSIONS.HR_REPORT_VIEW },
    ];
  },
});

export const run = query({
  args: {
    report: v.string(),
    bidangId: v.optional(v.id("organizationUnits")),
    jabatanId: v.optional(v.id("positions")),
    status: v.optional(v.string()),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_REPORT_VIEW);
    const includeSensitive = hasPermission(user, PERMISSIONS.HR_SENSITIVE_VIEW);
    const [employees, units, positions] = await Promise.all([
      ctx.db.query("employees").collect(),
      ctx.db.query("organizationUnits").collect(),
      ctx.db.query("positions").collect(),
    ]);
    const unitName = new Map(units.map((u) => [u._id, u.nama]));
    const positionName = new Map(positions.map((p) => [p._id, p.nama]));
    const scoped = employees.filter(
      (e) =>
        (!args.bidangId || e.bidangId === args.bidangId) &&
        (!args.jabatanId || e.jabatanId === args.jabatanId) &&
        (!args.status || e.status === args.status),
    );

    const base = (e: (typeof employees)[number]): Record<string, string | number> => ({
      NIY: e.niy,
      "Nama Lengkap": e.namaLengkap,
      Bidang: (e.bidangId ? unitName.get(e.bidangId) : "") ?? "",
      Jabatan: (e.jabatanId ? positionName.get(e.jabatanId) : "") ?? "",
      Status: e.status,
      "Status Akad": e.statusAkad ?? "",
      "Masa Kerja": calculateTenure(e.tanggalBergabung)?.label ?? "",
      Usia: calculateAge(e.tanggalLahir) ?? "",
    });
    const sensitive = (e: (typeof employees)[number]): Record<string, string | number> => ({
      NIK: e.nik ?? "",
      "No. BPJS": e.bpjsKesehatanNumber ?? "",
      Bank: e.bank ?? "",
      "No. Rekening": e.noRekening ?? "",
      "No. HP": e.noHp ?? "",
      Email: e.email ?? "",
    });
    const rows = (map: (e: (typeof employees)[number]) => Record<string, string | number>) =>
      scoped.map(map);

    switch (args.report) {
      case "employee-list": {
        const sample = employees[0];
        const columns = sample
          ? includeSensitive
            ? [...Object.keys(base(sample)), ...Object.keys(sensitive(sample))]
            : Object.keys(base(sample))
          : [];
        return {
          title: "Daftar Karyawan",
          columns,
          rows: rows((e) => (includeSensitive ? { ...base(e), ...sensitive(e) } : base(e))),
        };
      }

      case "by-bidang": {
        const tally = new Map<string, number>();
        for (const e of scoped.filter((e) => e.status === "AKTIF")) {
          const key = e.bidangId ? (unitName.get(e.bidangId) ?? "—") : "Belum Ditugaskan";
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
        return {
          title: "Karyawan per Bidang",
          columns: ["Bidang", "Jumlah"],
          rows: [...tally.entries()].map(([name, value]) => ({ Bidang: name, Jumlah: value })),
        };
      }

      case "by-jabatan": {
        const tally = new Map<string, number>();
        for (const e of scoped.filter((e) => e.status === "AKTIF")) {
          const key = e.jabatanId ? (positionName.get(e.jabatanId) ?? "—") : "Belum Ditugaskan";
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
        return {
          title: "Karyawan per Jabatan",
          columns: ["Jabatan", "Jumlah"],
          rows: [...tally.entries()].map(([name, value]) => ({ Jabatan: name, Jumlah: value })),
        };
      }

      case "by-status": {
        const tally = new Map<string, number>();
        for (const e of scoped) tally.set(e.status, (tally.get(e.status) ?? 0) + 1);
        return {
          title: "Status Aktif / Nonaktif",
          columns: ["Status", "Jumlah"],
          rows: [...tally.entries()].map(([name, value]) => ({ Status: name, Jumlah: value })),
        };
      }

      case "by-akad": {
        const tally = new Map<string, number>();
        for (const e of scoped.filter((e) => e.status === "AKTIF")) {
          const key = e.statusAkad ?? "—";
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
        return {
          title: "PKWT / PKWTT",
          columns: ["Status Akad", "Jumlah"],
          rows: [...tally.entries()].map(([name, value]) => ({ "Status Akad": name, Jumlah: value })),
        };
      }

      case "by-tenure":
        return {
          title: "Masa Kerja",
          columns: ["NIY", "Nama Lengkap", "Bidang", "Tanggal Bergabung", "Masa Kerja", "Tahun"],
          rows: scoped
            .map((e) => {
              const tenure = calculateTenure(e.tanggalBergabung);
              return {
                NIY: e.niy,
                "Nama Lengkap": e.namaLengkap,
                Bidang: e.bidangId ? unitName.get(e.bidangId) : "",
                "Tanggal Bergabung": e.tanggalBergabung ?? "",
                "Masa Kerja": tenure?.label ?? "",
                Tahun: tenure?.years ?? "",
              };
            })
            .sort((a, b) => Number(b.Tahun) - Number(a.Tahun)),
        };

      case "by-education":
        return {
          title: "Pendidikan",
          columns: ["Jenjang", "Jumlah"],
          rows: EDUCATION_LEVEL_OPTIONS.map((level) => ({
            Jenjang: level.label,
            Jumlah: scoped.filter((e) => e.status === "AKTIF" && e.pendidikanTerakhir === level.value)
              .length,
          })).filter((r) => r.Jumlah > 0),
        };

      case "by-marital": {
        const tally = new Map<string, number>();
        for (const e of scoped.filter((e) => e.status === "AKTIF")) {
          const key = e.statusPernikahan ?? "—";
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
        return {
          title: "Status Pernikahan",
          columns: ["Status Pernikahan", "Jumlah"],
          rows: [...tally.entries()].map(([name, value]) => ({ "Status Pernikahan": name, Jumlah: value })),
        };
      }

      case "contracts": {
        const [contracts] = await Promise.all([ctx.db.query("contracts").collect()]);
        const byId = new Map(employees.map((e) => [e._id, e]));
        return {
          title: "Kontrak",
          columns: ["NIY", "Nama Lengkap", "Nomor Kontrak", "Jenis", "Mulai", "Berakhir", "Status Kontrak", "Sisa Hari"],
          rows: contracts
            .filter((c) => {
              const e = byId.get(c.employeeId);
              return e && (!args.bidangId || e.bidangId === args.bidangId);
            })
            .map((c) => {
              const e = byId.get(c.employeeId)!;
              const evaluation = evaluateContractStatus(c.selesai);
              return {
                NIY: e.niy,
                "Nama Lengkap": e.namaLengkap,
                "Nomor Kontrak": c.nomor,
                Jenis: c.type,
                Mulai: c.mulai,
                Berakhir: c.selesai ?? "PKWTT",
                "Status Kontrak": evaluation.status,
                "Sisa Hari": evaluation.daysRemaining ?? "",
              };
            }),
        };
      }

      case "attendance": {
        const period = args.period ?? new Date().toISOString().slice(0, 7);
        const [records] = await Promise.all([ctx.db.query("attendanceRecords").collect()]);
        const days = buildMonth(period);
        const dates = new Set(days.map((d) => d.date));
        const activeIds = new Set(
          scoped.filter((e) => e.status === "AKTIF").map((e) => e._id),
        );
        const summary = summarizeAttendance(
          records.filter((r) => dates.has(r.date) && activeIds.has(r.employeeId)),
          { totalDays: days.filter((d) => !d.isSunday).length },
        );
        return {
          title: `Rekap Kehadiran ${period}`,
          columns: ["NIY", "Nama Lengkap", "Bidang", "Hadir", "Izin", "Sakit", "Cuti", "Alfa", "Terlambat", "Tingkat Kehadiran (%)"],
          rows: scoped
            .filter((e) => e.status === "AKTIF")
            .map((e) => {
              const own = records.filter(
                (r) => r.employeeId === e._id && dates.has(r.date),
              );
              const s = summarizeAttendance(own, { totalDays: days.filter((d) => !d.isSunday).length });
              return {
                NIY: e.niy,
                "Nama Lengkap": e.namaLengkap,
                Bidang: e.bidangId ? unitName.get(e.bidangId) : "",
                Hadir: s.hadir,
                Izin: s.izin,
                Sakit: s.sakit,
                Cuti: s.cuti,
                Alfa: s.alfa,
                Terlambat: s.late,
                "Tingkat Kehadiran (%)": s.attendanceRate,
              };
            }),
          footnotes: [
            `Total hari kerja: ${days.filter((d) => !d.isSunday).length}`,
            `Seluruh unit hadir: ${summary.hadir} · izin ${summary.izin} · sakit ${summary.sakit} · alfa ${summary.alfa}`,
          ],
        };
      }

      case "leave": {
        const period = args.period ?? new Date().toISOString().slice(0, 7);
        const [requests] = await Promise.all([ctx.db.query("leaveRequests").collect()]);
        return {
          title: `Cuti & Izin ${period}`,
          columns: ["Nomor", "NIY", "Nama Lengkap", "Bidang", "Jenis", "Mulai", "Selesai", "Hari", "Status"],
          rows: requests
            .filter((r) => r.startDate.startsWith(period))
            .map((r) => {
              const e = employees.find((x) => x._id === r.employeeId);
              return {
                Nomor: r.nomor,
                NIY: e?.niy ?? "",
                "Nama Lengkap": e?.namaLengkap ?? "—",
                Bidang: e?.bidangId ? unitName.get(e.bidangId) : "",
                Jenis: r.type,
                Mulai: r.startDate,
                Selesai: r.endDate,
                Hari: r.totalDays,
                Status: r.status,
              };
            }),
        };
      }

      case "training": {
        const [trainings, participants] = await Promise.all([
          ctx.db.query("trainings").collect(),
          ctx.db.query("trainingParticipants").collect(),
        ]);
        return {
          title: "Pelatihan",
          columns: ["Kode", "Nama Pelatihan", "Jenis", "Penyelenggara", "Mulai", "Selesai", "Status", "Peserta", "Biaya"],
          rows: trainings.map((t) => ({
            Kode: t.kode,
            "Nama Pelatihan": t.name,
            Jenis: t.type,
            Penyelenggara: t.organizer,
            Mulai: t.startDate,
            Selesai: t.endDate,
            Status: t.status,
            Peserta: participants.filter((p) => p.trainingId === t._id).length,
            Biaya: t.cost,
          })),
        };
      }

      case "performance": {
        const [assessments] = await Promise.all([ctx.db.query("performanceAssessments").collect()]);
        const byId = new Map(employees.map((e) => [e._id, e]));
        return {
          title: "Penilaian Kinerja",
          columns: ["NIY", "Nama Lengkap", "Bidang", "Periode", "Skor", "Nilai", "Status"],
          rows: assessments.map((a) => {
            const e = byId.get(a.employeeId);
            return {
              NIY: e?.niy ?? "",
              "Nama Lengkap": e?.namaLengkap ?? "—",
              Bidang: e?.bidangId ? unitName.get(e.bidangId) : "",
              Periode: a.period,
              Skor: a.finalScore ?? "",
              Nilai: a.grade ?? performanceGrade(a.finalScore ?? null) ?? "",
              Status: a.status,
            };
          }),
        };
      }

      case "mutation": {
        const [mutations] = await Promise.all([ctx.db.query("mutations").collect()]);
        const byId = new Map(employees.map((e) => [e._id, e]));
        return {
          title: "Mutasi / Promosi",
          columns: ["NIY", "Nama Lengkap", "Jenis", "Efektif", "Jabatan Asal", "Jabatan Baru", "SK"],
          rows: mutations.map((m) => {
            const e = byId.get(m.employeeId);
            return {
              NIY: e?.niy ?? "",
              "Nama Lengkap": e?.namaLengkap ?? "—",
              Jenis: m.type,
              Efektif: m.effectiveDate,
              "Jabatan Asal": m.fromPositionId ? positionName.get(m.fromPositionId) : "",
              "Jabatan Baru": m.toPositionId ? positionName.get(m.toPositionId) : "",
              SK: m.skNumber ?? "",
            };
          }),
        };
      }

      case "resignation": {
        const [records] = await Promise.all([ctx.db.query("resignations").collect()]);
        const byId = new Map(employees.map((e) => [e._id, e]));
        return {
          title: "Resign / Terminasi",
          columns: ["Nomor", "NIY", "Nama Lengkap", "Bidang", "Jenis", "Hari Terakhir", "Status", "Clearance (%)"],
          rows: records.map((r) => {
            const e = byId.get(r.employeeId);
            return {
              Nomor: r.nomor,
              NIY: e?.niy ?? "",
              "Nama Lengkap": e?.namaLengkap ?? "—",
              Bidang: e?.bidangId ? unitName.get(e.bidangId) : "",
              Jenis: r.type,
              "Hari Terakhir": r.lastWorkingDate,
              Status: r.status,
              "Clearance (%)": clearanceProgress(r).percent,
            };
          }),
        };
      }

      default:
        throw new Error(`Laporan "${args.report}" tidak dikenal`);
    }
  },
});

export const performanceGradeOf = query({
  args: { score: v.number() },
  handler: async (_ctx, args) => performanceGrade(args.score),
});
