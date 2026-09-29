# HRIS PIAT6 Bondowoso

Standalone Human Resources Information System for Pesantren Islam Al Irsyad Tengaran 6 Bondowoso.

## Important
- This repository contains documentation, templates, reference lists, and FICTIONAL sample data only.
- The real `Master data karyawan.xlsx` must NOT be committed to GitHub.
- Real employee data will be imported through the HRIS Import Karyawan feature after the application is ready.
- Architecture must remain merge-ready for later integration into PIAT 6 Super App.

## Source workbook structure
The design is based on the structure of the provided `Master data karyawan.xlsx`:
- Sheet: `Data Master Karyawan`
- Sheet: `Lembar2` (position reference)
- Sheet: `Rekap` (report categories)
- Sheet: `Dashboard`
- Sheet: `Pivot Table 1`

The employee master has 26 meaningful columns:
NIY, Nama Lengkap, Bidang, Jabatan, Tanggal Lahir, Usia, Tanggal Bergabung,
Masa Kerja, Status Akad, Durasi Kontrak, JT. Perpanjangan Kontrak, Status,
TMT Resign, No HP, Email, Tempat Lahir, Alamat KTP, NIK, No. BPJS Kesehatan,
Bank, No. Rekening, Status Pernikahan, Jumlah Anak, Pendidikan Terakhir,
Universitas, Jurusan.

## V1 target
Build a real, useful HRIS with:
Dashboard, Employee Master, Organization & Position, Employment/Contract,
Attendance, Leave/Permission, Payroll foundation, BPJS, Education & Competency,
Training, Performance, Discipline, Documents, Resignation/Termination,
Reports, Import/Export, audit trail, and role-based access.

## Later integration
The standalone HRIS is a development vehicle. Its domain model and API must be designed so HRIS can later become the HRD module of PIAT 6 Super App without rewriting the business logic.
