# HRIS PIAT6 Bondowoso

Human Resources Information System untuk **Pesantren Islam Al Irsyad Tengaran 6 Bondowoso**.
Aplikasi standalone yang siap di-merge sebagai modul HRD di **PIAT 6 Super App**.

> **Data karyawan asli tidak pernah masuk repository.** Hanya sample data fiktif.
> Data produksi masuk melalui **Import Karyawan** setelah aplikasi berjalan.

## Tech Stack

| Layer | Teknologi |
| --- | --- |
| UI | Vite + React 19 + TypeScript (strict) + Tailwind 3 + shadcn/ui-style components + Framer Motion |
| Backend / DB | Convex 1.46 (local backend, reactive queries) |
| Auth | Convex Auth (session cookie, server-side permission check di setiap function) |
| Routing | react-router-dom 7 (lazy routes, permission-aware navigation) |
| Import/Export | xlsx (XLSX + CSV) |
| Test | Vitest (65 unit test pada domain layer) |
| Runtime | Bun |

## Arsitektur (merge-ready)

```
UI (src/pages, src/components)
   ↓
Service boundary (src/lib/api.ts — satu titik import backend)
   ↓
Repository / domain (src/domain/* — pure, unit-tested)
   ↓
Convex functions (convex/* — requireUser/requirePermission di setiap handler)
   ↓
Convex storage (employeeRepository.ts adalah satu-satunya penulis tabel employees)
```

- **NIY** adalah business identifier karyawan — bukan nama.
- Usia dan masa kerja **dihitung dari tanggal**, tidak dipercaya dari Excel.
- Domain lain (contract, attendance, leave, payroll, ...) mereferensikan `employees`, tidak menduplikasi master data.
- Swap storage (Convex → Cloudflare D1 → Super App) hanya menyentuh `convex/lib/employeeRepository.ts` dan `src/lib/api.ts`.

## Modul (semua CRUD nyata, tanpa fake button)

- **Dashboard** — KPI, breakdown per bidang/jabatan/akad/pendidikan/pernikahan/masa kerja, kontrak akan berakhir, pengajuan pending, aktivitas HR; filter periode/bidang/jabatan/status.
- **Data Karyawan** — search, filter, sorting, pagination, tambah/ubah, nonaktif/aktifkan, ekspor CSV (kolom sensitif hanya dengan izin + audit), detail 15 tab.
- **Struktur Organisasi & Jabatan** — unit/bidang (Mudir, Madrasah, Kepengasuhan, Keuangan SDM, Rumah Tangga), org chart, assignment posisi.
- **Kontrak & Kepegawaian** — papan AMAN / MENDEKAT / PERLU_TINDAKAN / LEWAT, PKWT/PKWTT, perpanjangan, riwayat.
- **Kehadiran** — papan harian + rekam massal, rekap bulanan, jam kerja configurable, capture device-agnostic (MANUAL/WEB/FINGERPRINT/RFID/QR).
- **Cuti & Izin** — workflow Pengajuan → Approval → Approved/Rejected dengan histori dan saldo.
- **Payroll & BPJS** — foundation payroll configurable (komponen EARNING/DEDUCTION, FIXED/PERCENTAGE), periode + slip, BPJS Kesehatan/Ketenagakerjaan dan benefit dengan nomor termasking.
- **Pendidikan, Kompetensi & Pelatihan** — histori pendidikan, kompetensi berlevel, training dengan peserta dan sertifikat.
- **Kinerja, Disiplin & Pembinaan** — indikator configurable berbobot, penilaian periode, catatan disiplin (HR_SENSITIVE_VIEW).
- **Dokumen** — upload ke Convex storage (bukan repository), versi, expiry, verifikasi, unduh ber-audit.
- **Mutasi/Promosi & Resign/Terminasi** — SK mutasi, clearance checklist, karyawan tidak pernah dihapus.
- **Laporan** — report center dengan print/CSV/XLSX, mengikuti izin akun.
- **Import Data** — XLSX/CSV: UPLOAD → MAPPING → VALIDATION → PREVIEW → DUPLICATE CHECK → IMPORT → RESULT, dengan error report yang bisa diunduh.
- **Audit Log & Pengaturan** — jejak lengkap (siapa/kapan/aksi/entity/perubahan), manajemen user, role, permission matrix.

## Role & Permission (server-side authoritative)

`SUPER_ADMIN`, `HRD_ADMIN`, `HRD_STAFF`, `UNIT_MANAGER`, `REPORT_VIEWER`, `EMPLOYEE_SELF_SERVICE`
dengan 24 permission granular (HR_VIEW, HR_CREATE, HR_EDIT, HR_IMPORT, HR_SENSITIVE_VIEW, HR_PAYROLL_*, ...).
UI hanya menyembunyikan tombol; **backend selalu memeriksa ulang** di setiap query/mutation.

## Menjalankan

```bash
bun install
bun run dev        # dev server (dikelola platform Freebuff)
bun run test       # 65 unit test domain
bun tsc -b --noEmit
bun run build
```

Login awal: buat akun melalui halaman daftar, lalu beri peran `SUPER_ADMIN`
dari akun super admin bootstrap (lihat Pengaturan → Pengguna).

## Verifikasi

- ✅ `bunx convex dev --once` — functions ready
- ✅ `bun tsc -b --noEmit` — 0 error
- ✅ `bun run test` — 7 file, 65 test lulus
- ✅ `bun run build` — production build sukses
- ✅ Sample data fiktif (`sample-data/`), tanpa NIK/BPJS/rekening/HP asli

## Dokumen Spesifikasi

Lihat `HRIS-PIAT6-Bondowoso/docs/` — HRIS-MASTER-SPEC, IMPORT-KARYAWAN-SPEC,
UI-SPEC, SECURITY-AND-ROLES, ROADMAP.
