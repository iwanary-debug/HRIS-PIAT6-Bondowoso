/**
 * Employee detail — 15 tabs per UI-SPEC:
 * Profil, Kepegawaian, Pendidikan, Kehadiran, Cuti & Izin, Payroll,
 * BPJS & Benefit, Kompetensi, Pelatihan, Kinerja, Disiplin, Dokumen,
 * Mutasi/Promosi, Resign/Terminasi, Audit.
 */

import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Coins,
  FileText,
  GraduationCap,
  HeartPulse,
  History,
  Medal,
  ShieldAlert,
  User,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/overlays";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { InfoRow, SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, LoadingState } from "@/components/hris/states";
import { PageHeader } from "@/components/hris/PageHeader";
import { formatDate, formatDateLong, formatCurrency, initialsOf } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { MARITAL_STATUS_OPTIONS } from "@/domain/employee";
import { COMPETENCY_LEVEL_LABELS } from "@/domain/development";
import { LEAVE_TYPE_LABELS } from "@/domain/leave";
import { DOCUMENT_CATEGORY_LABELS } from "@/domain/lifecycle";

const TABS = [
  { key: "profil", label: "Profil", icon: User },
  { key: "kepegawaian", label: "Kepegawaian", icon: Briefcase },
  { key: "pendidikan", label: "Pendidikan", icon: GraduationCap },
  { key: "kehadiran", label: "Kehadiran", icon: CalendarDays },
  { key: "cuti", label: "Cuti & Izin", icon: ClipboardList },
  { key: "payroll", label: "Payroll", icon: Coins },
  { key: "benefit", label: "BPJS & Benefit", icon: HeartPulse },
  { key: "kompetensi", label: "Kompetensi", icon: Medal },
  { key: "pelatihan", label: "Pelatihan", icon: BadgeCheck },
  { key: "kinerja", label: "Kinerja", icon: Medal },
  { key: "disiplin", label: "Disiplin", icon: ShieldAlert },
  { key: "dokumen", label: "Dokumen", icon: FileText },
  { key: "mutasi", label: "Mutasi/Promosi", icon: Users },
  { key: "resign", label: "Resign/Terminasi", icon: Users },
  { key: "audit", label: "Audit", icon: History },
] as const;

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id as unknown as Id<"employees"> | undefined;
  const { can } = useAuth();

  const employee = useQuery(
    api.employees.get,
    employeeId ? { id: employeeId } : "skip",
  );

  // Sub-domain queries — each loads independently so tabs stay snappy.
  const contracts = useQuery(
    api.contracts.history,
    employeeId ? { employeeId } : "skip",
  );
  const attendance = useQuery(
    api.attendance.list,
    employeeId ? { employeeId } : "skip",
  );
  const leave = useQuery(
    api.leave.list,
    employeeId ? { employeeId } : "skip",
  );
  const leaveBalances = useQuery(
    api.leave.balances,
    employeeId ? { employeeId } : "skip",
  );
  const payrollPreview = useQuery(
    api.payroll.preview,
    employeeId && can("HR_PAYROLL_VIEW") ? { employeeId } : "skip",
  );
  const benefits = useQuery(
    api.benefits.list,
    employeeId ? { employeeId } : "skip",
  );
  const education = useQuery(
    api.education.listEducation,
    employeeId ? { employeeId } : "skip",
  );
  const competencies = useQuery(
    api.education.listCompetencies,
    employeeId ? { employeeId } : "skip",
  );
  const trainings = useQuery(api.trainings.list, {});
  const performance = useQuery(
    api.performance.list,
    employeeId ? { employeeId } : "skip",
  );
  const discipline = useQuery(
    api.lifecycle.disciplineList,
    employeeId && can("HR_SENSITIVE_VIEW") ? { employeeId } : "skip",
  );
  const documents = useQuery(
    api.lifecycle.documentList,
    employeeId ? { employeeId } : "skip",
  );
  const mutations = useQuery(
    api.lifecycle.mutationList,
    employeeId ? { employeeId } : "skip",
  );
  const resignations = useQuery(
    api.lifecycle.resignationList,
    employeeId ? { employeeId } : "skip",
  );

  if (!employeeId) {
    return <EmptyState title="ID karyawan tidak valid" description="Buka daftar karyawan dan pilih salah satu data." />;
  }
  if (employee === undefined) {
    return <LoadingState label="Memuat data karyawan…" />;
  }
  if (employee === null) {
    return (
      <EmptyState
        title="Karyawan tidak ditemukan"
        description="Data mungkin telah dinonaktifkan atau ID tidak valid."
        action={
          <Button variant="outlineNavy" asChild>
            <Link to="/app/employees">
              <ArrowLeft /> Kembali ke daftar
            </Link>
          </Button>
        }
      />
    );
  }

  const maritalLabel = MARITAL_STATUS_OPTIONS.find((option) => option.value === employee.statusPernikahan)?.label;

  return (
    <>
      <PageHeader
        title={employee.namaLengkap}
        description={`NIY ${employee.niy} · ${employee.jabatan ?? "Jabatan belum ditetapkan"} · ${employee.bidang ?? "Belum ditempatkan"}`}
        crumbs={[
          { label: "Beranda", to: "/app" },
          { label: "Data Karyawan", to: "/app/employees" },
          { label: employee.namaLengkap },
        ]}
        actions={
          <>
            <StatusBadge value={employee.status} />
            {employee.statusAkad && (
              <StatusBadge
                value={employee.statusAkad === "PKWT" ? "DRAFT" : "APPROVED"}
                label={employee.statusAkad}
              />
            )}
            <Button variant="outlineNavy" asChild>
              <Link to="/app/employees">
                <ArrowLeft /> Daftar karyawan
              </Link>
            </Button>
          </>
        }
      />

      {/* Identity header */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-700 p-6 text-white sm:flex-row sm:items-center">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl font-bold">
            {initialsOf(employee.namaLengkap)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{employee.namaLengkap}</h2>
            <p className="mt-0.5 text-sm text-white/70">
              {employee.jabatan ?? "Jabatan belum ditetapkan"} · {employee.bidang ?? "Belum ditempatkan"} · NIY{" "}
              <span className="font-mono">{employee.niy}</span>
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-4 text-center text-xs">
            <div>
              <dt className="text-white/60">Masa Kerja</dt>
              <dd className="mt-0.5 font-semibold">{employee.masaKerjaLabel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/60">Usia</dt>
              <dd className="mt-0.5 font-semibold">{employee.usia ? `${employee.usia} th` : "—"}</dd>
            </div>
            <div>
              <dt className="text-white/60">Bergabung</dt>
              <dd className="mt-0.5 font-semibold">{formatDate(employee.tanggalBergabung)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Tabs defaultValue="profil">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              <tab.icon /> {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 1. Profil */}
        <TabsContent value="profil">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Data Pribadi">
              <dl className="divide-y divide-border/60">
                <InfoRow label="Nama Lengkap" value={employee.namaLengkap} />
                <InfoRow label="NIY" value={employee.niy} mono />
                <InfoRow label="Tempat Lahir" value={employee.tempatLahir ?? "—"} />
                <InfoRow label="Tanggal Lahir" value={formatDateLong(employee.tanggalLahir)} />
                <InfoRow label="Usia" value={employee.usia ? `${employee.usia} tahun` : "—"} />
                <InfoRow label="Status Pernikahan" value={maritalLabel ?? "—"} />
                <InfoRow label="Jumlah Anak" value={employee.jumlahAnak ?? "—"} />
              </dl>
            </SectionCard>
            <SectionCard title="Kontak & Alamat">
              {employee.redacted ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Kontak, alamat, NIK, BPJS, dan rekening disembunyikan. Akses memerlukan izin{" "}
                  <strong>HR_SENSITIVE_VIEW</strong> dan setiap penampilan tercatat di audit log.
                </div>
              ) : (
                <dl className="divide-y divide-border/60">
                  <InfoRow label="No. HP" value={employee.noHp ?? "—"} mono />
                  <InfoRow label="Email" value={employee.email ?? "—"} />
                  <InfoRow label="Alamat KTP" value={employee.alamatKtp ?? "—"} />
                  <InfoRow label="NIK" value={employee.nik ?? "—"} mono />
                </dl>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* 2. Kepegawaian */}
        <TabsContent value="kepegawaian">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Status Kepegawaian">
              <dl className="divide-y divide-border/60">
                <InfoRow label="Status" value={<StatusBadge value={employee.status} />} />
                <InfoRow label="Status Akad" value={employee.statusAkad ?? "—"} />
                <InfoRow label="Tanggal Bergabung" value={formatDate(employee.tanggalBergabung)} />
                <InfoRow label="Masa Kerja" value={employee.masaKerjaLabel ?? "—"} />
                <InfoRow
                  label="Durasi Kontrak"
                  value={employee.durasiKontrak ?? (employee.statusAkad === "PKWTT" ? "Tanpa batas" : "—")}
                />
                <InfoRow label="JT. Perpanjangan Kontrak" value={formatDate(employee.jtPerpanjanganKontrak)} />
                <InfoRow label="TMT Resign" value={formatDate(employee.tmtResign)} />
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Usia dan masa kerja selalu dihitung ulang dari tanggal, bukan nilai manual spreadsheet.
              </p>
            </SectionCard>
            <SectionCard
              title="Riwayat Kontrak"
              actions={
                can("HR_CONTRACT_VIEW") ? (
                  <Button variant="outlineNavy" size="sm" asChild>
                    <Link to="/app/contracts">Modul Kontrak</Link>
                  </Button>
                ) : undefined
              }
            >
              {contracts === undefined ? (
                <LoadingState label="Memuat kontrak…" />
              ) : contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada kontrak tercatat.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nomor</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Mulai</TableHead>
                        <TableHead>Berakhir</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contracts.map((contract) => (
                        <TableRow key={contract.id}>
                          <TableCell className="font-mono text-xs">{contract.nomor}</TableCell>
                          <TableCell>{contract.type}</TableCell>
                          <TableCell>{formatDate(contract.mulai)}</TableCell>
                          <TableCell>{contract.selesai ? formatDate(contract.selesai) : "PKWTT"}</TableCell>
                          <TableCell>
                            <StatusBadge value={contract.contractStatus} label={contract.contractStatus} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* 3. Pendidikan */}
        <TabsContent value="pendidikan">
          <SectionCard
            title="Riwayat Pendidikan"
            description="Histori lengkap — pendidikan terakhir pada master hanyalah rekaman terkini."
          >
            {education === undefined ? (
              <LoadingState label="Memuat pendidikan…" />
            ) : education.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada riwayat. Kolom master saat ini: {employee.pendidikanTerakhir ?? "—"} ·{" "}
                {employee.universitas ?? "—"} · {employee.jurusan ?? "—"}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jenjang</TableHead>
                      <TableHead>Institusi</TableHead>
                      <TableHead>Jurusan</TableHead>
                      <TableHead>Tahun</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {education.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.level}</TableCell>
                        <TableCell>{record.institution}</TableCell>
                        <TableCell>{record.major ?? "—"}</TableCell>
                        <TableCell>{record.graduationYear ?? "—"}</TableCell>
                        <TableCell>
                          {record.isCurrent ? <StatusBadge value="APPROVED" label="Terkini" /> : <span className="text-xs text-muted-foreground">Riwayat</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* 4. Kehadiran */}
        <TabsContent value="kehadiran">
          <SectionCard title="Rekap Kehadiran" description="60 catatan terakhir untuk karyawan ini.">
            {attendance === undefined ? (
              <LoadingState label="Memuat kehadiran…" />
            ) : attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada catatan kehadiran.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Masuk</TableHead>
                      <TableHead>Keluar</TableHead>
                      <TableHead>Terlambat</TableHead>
                      <TableHead>Sumber</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.slice(0, 60).map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{formatDate(record.date)}</TableCell>
                        <TableCell><StatusBadge value={record.status} /></TableCell>
                        <TableCell>{record.checkIn ?? "—"}</TableCell>
                        <TableCell>{record.checkOut ?? "—"}</TableCell>
                        <TableCell className={record.lateMinutes ? "text-red-700" : ""}>
                          {record.lateMinutes ? `${record.lateMinutes} mnt` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{record.source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* 5. Cuti & Izin */}
        <TabsContent value="cuti">
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <SectionCard title="Saldo Cuti">
              {leaveBalances === undefined ? (
                <LoadingState label="Memuat saldo…" />
              ) : leaveBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground">Saldo cuti belum disetel untuk tahun berjalan.</p>
              ) : (
                <dl className="divide-y divide-border/60">
                  {leaveBalances.map((balance) => (
                    <InfoRow
                      key={balance._id}
                      label={`${balance.type} ${balance.year}`}
                      value={`${balance.used}/${balance.entitled} hari terpakai · sisa ${balance.remaining}`}
                    />
                  ))}
                </dl>
              )}
            </SectionCard>
            <SectionCard title="Riwayat Pengajuan">
              {leave === undefined ? (
                <LoadingState label="Memuat cuti…" />
              ) : leave.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada pengajuan cuti/izin.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nomor</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Hari</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leave.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-mono text-xs">{request.nomor}</TableCell>
                          <TableCell>{LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}</TableCell>
                          <TableCell>
                            {formatDate(request.startDate)} – {formatDate(request.endDate)}
                          </TableCell>
                          <TableCell className="tabular-nums">{request.totalDays}</TableCell>
                          <TableCell><StatusBadge value={request.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* 6. Payroll */}
        <TabsContent value="payroll">
          {!can("HR_PAYROLL_VIEW") ? (
            <EmptyState
              icon={ShieldAlert}
              title="Data payroll terbatas"
              description="Hanya pengguna dengan izin HR_PAYROLL_VIEW yang dapat melihat data ini."
            />
          ) : payrollPreview === undefined ? (
            <LoadingState label="Menghitung payroll…" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Struktur & Perhitungan" description="Preview berdasarkan komponen payroll aktif.">
                {payrollPreview.computation.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Belum ada struktur gaji. Nilai gaji pokok diatur melalui modul Payroll.
                  </p>
                ) : (
                  <dl className="divide-y divide-border/60">
                    <InfoRow label="Gaji Pokok" value={formatCurrency(payrollPreview.computation.baseSalary)} />
                    {payrollPreview.computation.lines
                      .filter((line) => line.kind === "EARNING" || line.kind === "INFORMATIONAL")
                      .map((line) => (
                        <InfoRow key={line.code} label={line.name} value={formatCurrency(line.amount)} />
                      ))}
                    {payrollPreview.computation.lines
                      .filter((line) => line.kind === "DEDUCTION")
                      .map((line) => (
                        <InfoRow
                          key={line.code}
                          label={line.name}
                          value={<span className="text-red-700">-{formatCurrency(line.amount)}</span>}
                        />
                      ))}
                    <InfoRow
                      label="Total Diterima"
                      value={<strong>{formatCurrency(payrollPreview.computation.netPay)}</strong>}
                    />
                  </dl>
                )}
              </SectionCard>
              <SectionCard title="Catatan">
                <p className="text-sm text-muted-foreground">
                  Slip gaji historis tersedia di modul Payroll per periode. Nilai terhitung di sini adalah preview
                  konfigurasi saat ini, bukan slip resmi.
                </p>
              </SectionCard>
            </div>
          )}
        </TabsContent>

        {/* 7. BPJS & Benefit */}
        <TabsContent value="benefit">
          <SectionCard title="BPJS & Benefit">
            {benefits === undefined ? (
              <LoadingState label="Memuat benefit…" />
            ) : benefits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pendaftaran BPJS/benefit.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Penyedia</TableHead>
                      <TableHead>No. Kepesertaan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sejak</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {benefits.map((benefit) => (
                      <TableRow key={benefit.id}>
                        <TableCell className="font-medium">{benefit.type}</TableCell>
                        <TableCell>{benefit.provider ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{benefit.number ?? "—"}</TableCell>
                        <TableCell><StatusBadge value={benefit.status} /></TableCell>
                        <TableCell>{formatDate(benefit.startDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* 8. Kompetensi */}
        <TabsContent value="kompetensi">
          <SectionCard title="Kompetensi & Sertifikasi">
            {competencies === undefined ? (
              <LoadingState label="Memuat kompetensi…" />
            ) : competencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada kompetensi yang dinilai.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {competencies.map((competency) => (
                  <Card key={competency.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">{competency.name}</p>
                        <p className="text-xs text-muted-foreground">{competency.category}</p>
                      </div>
                      <StatusBadge
                        value="APPROVED"
                        label={COMPETENCY_LEVEL_LABELS[competency.level] ?? `Level ${competency.level}`}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Dinilai {formatDate(competency.assessedAt)}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* 9. Pelatihan */}
        <TabsContent value="pelatihan">
          <SectionCard title="Riwayat Pelatihan">
            {trainings === undefined ? (
              <LoadingState label="Memuat pelatihan…" />
            ) : (
              (() => {
                const own = trainings.flatMap((training) =>
                  training.peserta
                    .filter((participant) => participant.employeeId === employeeId)
                    .map((participant) => ({ training, participant })),
                );
                return own.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum mengikuti pelatihan.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kode</TableHead>
                          <TableHead>Pelatihan</TableHead>
                          <TableHead>Periode</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Sertifikat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {own.map(({ training, participant }) => (
                          <TableRow key={participant.id}>
                            <TableCell className="font-mono text-xs">{training.kode}</TableCell>
                            <TableCell className="font-medium">{training.name}</TableCell>
                            <TableCell>
                              {formatDate(training.startDate)} – {formatDate(training.endDate)}
                            </TableCell>
                            <TableCell><StatusBadge value={participant.status} /></TableCell>
                            <TableCell className="font-mono text-xs">{participant.certificateNumber ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()
            )}
          </SectionCard>
        </TabsContent>

        {/* 10. Kinerja */}
        <TabsContent value="kinerja">
          <SectionCard title="Penilaian Kinerja">
            {performance === undefined ? (
              <LoadingState label="Memuat kinerja…" />
            ) : performance.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada penilaian.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead>Skor</TableHead>
                      <TableHead>Nilai</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Evaluator</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performance.map((assessment) => (
                      <TableRow key={assessment.id}>
                        <TableCell className="font-medium">{assessment.period}</TableCell>
                        <TableCell className="tabular-nums">{assessment.finalScore ?? "—"}</TableCell>
                        <TableCell>{assessment.grade ?? "—"}</TableCell>
                        <TableCell><StatusBadge value={assessment.status === "FINALIZED" ? "APPROVED" : "DRAFT"} label={assessment.status} /></TableCell>
                        <TableCell>{assessment.evaluatorName ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* 11. Disiplin */}
        <TabsContent value="disiplin">
          {!can("HR_SENSITIVE_VIEW") ? (
            <EmptyState
              icon={ShieldAlert}
              title="Data disiplin bersifat sensitif"
              description="Memerlukan izin HR_SENSITIVE_VIEW."
            />
          ) : discipline === undefined ? (
            <LoadingState label="Memuat catatan disiplin…" />
          ) : discipline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada catatan disiplin — pertahankan.</p>
          ) : (
            <div className="space-y-3">
              {discipline.map((record) => (
                <Card key={record.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground">
                        {record.violationType} · {record.action}
                      </p>
                      <p className="text-xs text-muted-foreground">Kejadian {formatDate(record.incidentDate)}</p>
                    </div>
                    <StatusBadge value={record.status} />
                  </div>
                  <p className="mt-2 text-sm text-foreground">{record.description}</p>
                  {record.coachingNotes && (
                    <p className="mt-1 text-xs text-muted-foreground">Pembinaan: {record.coachingNotes}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 12. Dokumen */}
        <TabsContent value="dokumen">
          <SectionCard title="Dokumen Karyawan" description="KTP, KK, ijazah, SK, kontrak — dengan versi & masa berlaku.">
            {documents === undefined ? (
              <LoadingState label="Memuat dokumen…" />
            ) : documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada dokumen terunggah.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Versi</TableHead>
                      <TableHead>Berlaku s.d.</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((document) => (
                      <TableRow key={document.id}>
                        <TableCell>
                          {DOCUMENT_CATEGORY_LABELS[document.category as keyof typeof DOCUMENT_CATEGORY_LABELS] ?? document.category}
                        </TableCell>
                        <TableCell className="font-medium">{document.name}</TableCell>
                        <TableCell className="tabular-nums">v{document.version}</TableCell>
                        <TableCell>{formatDate(document.expiryDate)}</TableCell>
                        <TableCell><StatusBadge value={document.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* 13. Mutasi/Promosi */}
        <TabsContent value="mutasi">
          <SectionCard title="Riwayat Mutasi / Promosi">
            {mutations === undefined ? (
              <LoadingState label="Memuat mutasi…" />
            ) : mutations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada mutasi/promosi.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Efektif</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Dari</TableHead>
                      <TableHead>Ke</TableHead>
                      <TableHead>SK</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mutations.map((mutation) => (
                      <TableRow key={mutation.id}>
                        <TableCell>{formatDate(mutation.effectiveDate)}</TableCell>
                        <TableCell>{mutation.type}</TableCell>
                        <TableCell>
                          {mutation.fromPositionName ?? "—"}
                          {mutation.fromUnitName ? ` (${mutation.fromUnitName})` : ""}
                        </TableCell>
                        <TableCell>
                          {mutation.toPositionName ?? "—"}
                          {mutation.toUnitName ? ` (${mutation.toUnitName})` : ""}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{mutation.skNumber ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* 14. Resign/Terminasi */}
        <TabsContent value="resign">
          <SectionCard title="Proses Resign / Terminasi">
            {resignations === undefined ? (
              <LoadingState label="Memuat…" />
            ) : (
              (() => {
                const own = resignations.filter((record) => record.employeeId === employeeId);
                return own.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada proses keluar untuk karyawan ini.</p>
                ) : (
                  <div className="space-y-3">
                    {own.map((record) => (
                      <Card key={record.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-foreground">
                              {record.nomor} · {record.type}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Hari terakhir {formatDate(record.lastWorkingDate)} · {record.reason}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Clearance {record.progress.percent}%</span>
                            <StatusBadge value={record.status} />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                );
              })()
            )}
          </SectionCard>
        </TabsContent>

        {/* 15. Audit */}
        <TabsContent value="audit">
          {!can("HR_AUDIT_VIEW") ? (
            <EmptyState icon={History} title="Audit log terbatas" description="Memerlukan izin HR_AUDIT_VIEW." />
          ) : (
            <SectionCard title="Aktivitas terkait" description="Catatan audit sistem (ringkas, tanpa data sensitif mentah).">
              <p className="text-sm text-muted-foreground">
                Buka <Link to="/app/audit" className="font-medium text-primary underline-offset-4 hover:underline">Audit Log</Link>{" "}
                untuk memfilter seluruh aktivitas. Setiap perubahan data karyawan — termasuk akses data sensitif —
                tercatat otomatis oleh backend.
              </p>
            </SectionCard>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

