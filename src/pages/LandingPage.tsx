import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCheck,
  CheckCircle2,
  FileSpreadsheet,
  Fingerprint,
  GraduationCap,
  Network,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/overlays";
import { useAuth } from "@/providers/AuthProvider";

const MODULES = [
  {
    icon: Users,
    title: "Data Karyawan",
    body: "Master karyawan 26 kolom sesuai struktur workbook resmi, dengan NIY sebagai business identifier dan usia serta masa kerja yang selalu dihitung ulang dari tanggal.",
  },
  {
    icon: FileSpreadsheet,
    title: "Import Karyawan",
    body: "Alur lengkap Upload → Mapping → Validasi → Preview → Deteksi Duplikat → Konfirmasi → Hasil, untuk XLSX dan CSV, lengkap dengan laporan error.",
  },
  {
    icon: Network,
    title: "Struktur Organisasi",
    body: "Unit, jabatan, atasan dan bawahan dalam bentuk organisation chart yang bisa dibaca HRD dalam satu layar.",
  },
  {
    icon: CalendarCheck,
    title: "Kehadiran & Cuti",
    body: "Absensi harian dan bulanan, cuti dengan alur pengajuan–persetujuan, dan abstraksi perangkat fingerprint, RFID, maupun QR.",
  },
  {
    icon: Wallet,
    title: "Payroll & BPJS",
    body: "Fondasi payroll yang sepenuhnya konfigurabel: komponen, periode, dan slip gaji. Tidak ada aturan gaji PIAT 6 yang dikarang di dalam sistem.",
  },
  {
    icon: BarChart3,
    title: "Laporan & Audit",
    body: "15 laporan siap cetak dan ekspor, ditambah audit trail untuk setiap perubahan penting tanpa menyimpan data sensitif mentah.",
  },
];

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "Aman by default",
    body: "Otorisasi dijalankan di server, data sensitif hanya dibuka lewat aksi terpisah yang tercatat, dan hard delete karyawan memang diblokir.",
  },
  {
    icon: Building2,
    title: "Modular & merge-ready",
    body: "UI, domain, service, dan repository terpisah sejak awal, supaya HRIS bisa menjadi modul HRD di PIAT 6 Super App tanpa tulis ulang.",
  },
  {
    icon: GraduationCap,
    title: "Sumber kebenaran = dokumen",
    body: "Struktur mengikuti HRIS Master Spec, Import Spec, UI Spec, dan Security & Roles yang sudah ada di repository.",
  },
];

export default function LandingPage() {
  const { status } = useAuth();
  const appHref = status === "authenticated" ? "/app" : "/auth";

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="grid size-9 place-items-center rounded-lg bg-navy-900 text-sm font-extrabold text-white">
            H6
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-navy-900">HRIS PIAT6</p>
            <p className="truncate text-[11px] leading-tight text-navy-500">Bondowoso</p>
          </div>
          <nav className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <a href="#modul">Modul</a>
            </Button>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <a href="#prinsip">Prinsip</a>
            </Button>
            <Button size="sm" asChild>
              <Link to={appHref}>
                {status === "authenticated" ? "Buka Aplikasi" : "Masuk"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-navy-100 bg-navy-900 text-white">
        <div className="surface-grid absolute inset-0 opacity-[0.18]" />
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-navy-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 size-[24rem] rounded-full bg-navy-400/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="border-white/20 bg-white/10 text-navy-100">
              <CheckCircle2 className="size-3" /> Versi 1 — Fondasi & Data Master
            </Badge>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Human Resources Information System
              <span className="block text-navy-200">PIAT 6 Bondowoso</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-navy-100/85">
              Sistem pengelolaan sumber daya manusia untuk{" "}
              <span className="font-semibold text-white">
                Pesantren Islam Al Irsyad Tengaran 6 Bondowoso
              </span>
              . Dari master karyawan, kontrak, kehadiran, cuti, hingga payroll — satu
              sumber data SDM yang siap menjadi modul HRD di PIAT 6 Super App.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" variant="outline" className="border-white bg-white text-navy-900 hover:bg-navy-50" asChild>
                <Link to={appHref}>
                  {status === "authenticated" ? "Lanjut ke Dashboard" : "Masuk ke HRIS"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <a href="#modul">Lihat modul</a>
              </Button>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
              {[
                { label: "Domain HR", value: "18" },
                { label: "Izin granular", value: "24" },
                { label: "Laporan siap pakai", value: "15" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-xs uppercase tracking-wide text-navy-300">{stat.label}</dt>
                  <dd className="mt-1 text-2xl font-bold">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:pt-6"
          >
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                <span className="size-2.5 rounded-full bg-red-400/80" />
                <span className="size-2.5 rounded-full bg-amber-400/80" />
                <span className="size-2.5 rounded-full bg-emerald-400/80" />
                <p className="ml-2 text-xs text-navy-200">Dashboard HRIS</p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4">
                {[
                  { label: "Total Karyawan", value: "42", accent: "text-navy-100" },
                  { label: "PKWT / PKWTT", value: "18 / 24", accent: "text-emerald-300" },
                  { label: "Kontrak Perlu Perhatian", value: "5", accent: "text-amber-300" },
                  { label: "Cuti Menunggu", value: "3", accent: "text-sky-300" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-navy-300">
                      {item.label}
                    </p>
                    <p className={`mt-1 text-xl font-bold ${item.accent}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                {["Kepengasuhan", "Madrasah", "Rumah Tangga", "Keuangan SDM"].map((unit, index) => (
                  <div key={unit} className="flex items-center gap-3">
                    <span className="w-28 truncate text-xs text-navy-200">{unit}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full bg-navy-400"
                        style={{ width: `${[82, 64, 38, 26][index]}%` }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Modules */}
      <section id="modul" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">
            Cakupan modul
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-navy-900">
            Setiap modul punya alur kerja nyata
          </h2>
          <p className="mt-3 text-navy-600">
            Tidak ada tombol palsu. Setiap tombol yang tampil menjalankan operasi sungguhan:
            validasi, izin, dan jejak audit di backend.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module, index) => (
            <motion.article
              key={module.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.35, delay: (index % 3) * 0.06 }}
              className="group rounded-xl border border-navy-100 bg-white p-5 transition hover:border-navy-200 hover:shadow-[0_18px_40px_-28px_rgba(15,31,63,0.5)]"
            >
              <span className="grid size-11 place-items-center rounded-lg bg-navy-50 text-navy-700 transition group-hover:bg-navy-900 group-hover:text-white">
                <module.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-navy-900">{module.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">{module.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Principles */}
      <section id="prinsip" className="border-y border-navy-100 bg-navy-50/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">
              Prinsip pembangunan
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-navy-900">
              Powerful di belakang, sederhana di depan
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <div
                key={principle.title}
                className="rounded-xl border border-navy-100 bg-white p-6"
              >
                <principle.icon className="size-6 text-navy-700" />
                <h3 className="mt-4 font-semibold text-navy-900">{principle.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-600">{principle.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Badge variant="info">Arah integrasi</Badge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-navy-900">
              Dibangun untuk jadi modul HRD, bukan aplikasi yang terlupakan
            </h2>
            <p className="mt-4 text-navy-600">
              Employee master di HRIS ini dirancang menjadi satu-satunya sumber data SDM.
              Ketika HRIS ini kemudian menjadi modul HRD di PIAT 6 Super App, tidak akan
              dibuat master karyawan kedua — cukup penggabungan lewat shared identity dan
              master-data strategy.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Akademik", "Kepengasuhan", "HRIS", "Keuangan", "6Mart", "UKS", "BK", "Perpustakaan", "Sarpras"].map(
                (module) => (
                  <span
                    key={module}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      module === "HRIS"
                        ? "border-navy-900 bg-navy-900 text-white"
                        : "border-navy-200 bg-white text-navy-600"
                    }`}
                  >
                    {module}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-navy-100 bg-white p-6">
            <div className="flex items-start gap-3">
              <Fingerprint className="mt-0.5 size-5 shrink-0 text-navy-700" />
              <div>
                <h3 className="font-semibold text-navy-900">Absensi tanpa mengunci perangkat</h3>
                <p className="mt-1 text-sm text-navy-600">
                  Sumber kehadiran menyimpan asal data (manual, web, mobile, fingerprint,
                  RFID, atau QR) sehingga perangkat absensi bisa ditambahkan tanpa
                  mengubah model data.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-navy-700" />
              <div>
                <h3 className="font-semibold text-navy-900">Data pribadi tidak masuk repository</h3>
                <p className="mt-1 text-sm text-navy-600">
                  NIK, BPJS, rekening, alamat, dan nomor HP produksi hanya bisa masuk lewat
                  Import Karyawan di dalam aplikasi. Repository hanya berisi data contoh
                  yang jelas-jelas fiktif.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-navy-100 bg-navy-900 py-16 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 text-center sm:px-6">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
            Siap mengelola seluruh data dan proses SDM PIAT 6 Bondowoso
          </h2>
          <p className="max-w-xl text-navy-200">
            Akun pertama yang dibuat menjadi Super Admin, sehingga HRD dapat langsung
            menyiapkan data referensi dan mengimpor master karyawan.
          </p>
          <Button size="lg" className="bg-white text-navy-900 hover:bg-navy-50" asChild>
            <Link to={appHref}>
              {status === "authenticated" ? "Buka Aplikasi" : "Masuk atau Buat Akun"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-navy-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-navy-500 sm:flex-row sm:px-6">
          <p>HRIS PIAT6 Bondowoso — Pesantren Islam Al Irsyad Tengaran 6 Bondowoso</p>
          <p>Standalone sekarang · Merge-ready ke PIAT 6 Super App</p>
        </div>
      </footer>
    </div>
  );
}
