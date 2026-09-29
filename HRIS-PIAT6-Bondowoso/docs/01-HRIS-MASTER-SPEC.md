# HRIS PIAT6 — Master Specification

## 1. Identity
- Product: HRIS PIAT6 Bondowoso
- Institution: Pesantren Islam Al Irsyad Tengaran 6 Bondowoso
- Development mode: standalone first, merge-ready later
- UX principle: powerful behind the scenes, simple in front
- No fake buttons: implemented features must work end-to-end.

## 2. Core modules
1. Dashboard HR
2. Data Karyawan
3. Struktur Organisasi
4. Jabatan & Unit
5. Kontrak & SK
6. Kehadiran
7. Cuti & Izin
8. Payroll & Komponen Penghasilan (foundation first)
9. BPJS & Benefit
10. Pendidikan & Kompetensi
11. Pelatihan
12. Penilaian Kinerja
13. Disiplin & Pembinaan
14. Dokumen Karyawan
15. Mutasi / Promosi
16. Resign / Terminasi
17. Laporan
18. Import / Export
19. Pengaturan & Audit

## 3. Employee master fields from source workbook
NIY, Nama Lengkap, Bidang, Jabatan, Tanggal Lahir, Usia, Tanggal Bergabung,
Masa Kerja, Status Akad, Durasi Kontrak, JT. Perpanjangan Kontrak, Status,
TMT Resign, No HP, Email, Tempat Lahir, Alamat KTP (Kab./Kota), NIK,
No. BPJS Kesehatan, Bank, No. Rekening, Status Pernikahan, Jumlah Anak,
Pendidikan Terakhir, Universitas, Jurusan.

Derived fields such as Usia and Masa Kerja should be calculated where practical,
not manually trusted from import.

## 4. Import workflow
Upload -> Parse -> Mapping -> Validation -> Preview -> Duplicate Check ->
Confirm -> Import -> Result Summary -> Error Export.

Business identifier: NIY.
Blank/formatted rows must be ignored.
Import must never silently overwrite existing records.
Provide create/update/skip/error counts.

## 5. Sensitive data
NIK, BPJS number, bank account, address, phone, and employment documents
must be permission-controlled and should not appear in Git history, sample data,
logs, URLs, or error messages.

## 6. Reporting
At minimum support employee counts by:
- Bidang/Unit
- Jabatan
- Status
- Status Akad
- Pendidikan
- Status Pernikahan
- Contract/renewal status
- Attendance
- Leave/permission
- Training
- Performance

## 7. Integration contract
Keep domain entities, service/repository interfaces, API DTOs, and permission
names modular. Do not hard-wire the standalone application so that later
integration into PIAT 6 Super App requires a rewrite.
