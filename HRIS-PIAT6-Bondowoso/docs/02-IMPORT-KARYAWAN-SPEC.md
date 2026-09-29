# Import Karyawan Specification

## Source
The real source workbook is `Master data karyawan.xlsx`, but the real workbook
must remain outside GitHub.

## Sheet selection
Default source sheet: `Data Master Karyawan`.

## Meaningful source columns
1 NIY
2 Nama Lengkap
3 Bidang
4 Jabatan
5 Tanggal Lahir
6 Usia
7 Tanggal Bergabung
8 Masa Kerja
9 Status Akad
10 Durasi Kontrak
11 JT. Perpanjangan Kontrak
12 Status
13 TMT Resign
14 No HP
15 Email
16 Tempat Lahir
17 Alamat KTP
18 NIK
19 No. BPJS Kesehatan
20 Bank
21 No. Rekening
22 Status Pernikahan
23 Jumlah Anak
24 Pendidikan Terakhir
25 Universitas
26 Jurusan

## Rules
- NIY is the unique business identifier.
- Ignore fully blank rows and formatting-only rows.
- Preserve source values during preview.
- Normalize dates safely.
- Calculate age from date of birth when possible.
- Calculate tenure from join date when possible.
- Validate status, contract type, numeric fields, and dates.
- Detect duplicate NIY both inside the uploaded file and against the database.
- Never expose sensitive values in logs.
- Allow user to download an error report.
- Import transactionally where practical.
- Show a final summary.

## Supported input
XLSX and CSV.
