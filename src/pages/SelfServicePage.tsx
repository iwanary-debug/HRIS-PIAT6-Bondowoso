/**
 * Portal Karyawan — beranda pribadi untuk akun dengan peran Karyawan.
 *
 * Semua data di halaman ini berasal dari `convex/selfService.ts` yang hanya
 * memuat data milik karyawan itu sendiri. Karyawan tidak pernah melihat data
 * rekan kerja, dan backend menolak permintaan di luar halamannya.
 */

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  CalendarDays,
  CalendarPlus,
  Clock,
  FileText,
  IdCard,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { InfoRow, SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, ErrorState, LoadingState, describeError } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/overlays";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { printPayslip } from "@/lib/payslip";
import { LEAVE_TYPE, LEAVE_TYPE_LABELS, calculateLeaveDays, type LeaveType } from "@/domain/leave";
import { ROLE_LABELS, type Role } from "@/domain/permissions";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "ringkasan", label: "Ringkasan", icon: BadgeCheck },
  { key: "absensi", label: "Absensi", icon: Clock },
  { key: "cuti", label: "Cuti & Izin", icon: CalendarDays },
  { key: "slip", label: "Slip Gaji", icon: Wallet },
  { key: "dokumen", label: "Dokumen", icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function SelfServicePage() {
  const [tab, setTab] = React.useState<TabKey>("ringkasan");
  const [period, setPeriod] = React.useState(currentPeriod);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    type: LEAVE_TYPE.CUTI as string,
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [submitting, setSubmitting] = React.useState(false);

  const overview = useQuery(api.selfService.overview, { period });
  const attendance = useQuery(api.selfService.attendance, { period });
  const leave = useQuery(api.selfService.leave, {});
  const payslips = useQuery(api.selfService.payslips, {});
  const documents = useQuery(api.selfService.documents, {});
  const requestLeave = useMutation(api.selfService.requestLeave);

  // Only request the data the visible tab needs.
  const showAttendance = tab === "absensi";
  const showLeave = tab === "cuti";
  const showPayslips = tab === "slip";
  const showDocuments = tab === "dokumen";

  if (overview === undefined) return <LoadingState label="Memuat data karyawan…" />;

  if (overview instanceof Error) {
    const described = describeError(overview);
    return <ErrorState title={described.title} message={described.message} />;
  }

  // An account without a linked employee record is a normal state, not a fault:
  // the backend answers with `UNLINKED` instead of throwing, so the portal can
  // explain what to do rather than showing an error page.
  if (overview.status === "UNLINKED") {
    return (
      <EmptyState
        icon={IdCard}
        title="Akun belum terhubung ke data karyawan"
        description={`${overview.account.name}, portal ini menampilkan data pribadi Anda sendiri. Master data Anda sudah ada di sistem — yang belum adalah tautannya. Buka Pengaturan → Pengguna, lalu ketik NIY Anda pada kolom "Ketik NIY lalu Enter" untuk menautkan akun ini ke data karyawan.`}
      />
    );
  }

  const totalDays = form.startDate && form.endDate
    ? calculateLeaveDays(form.startDate, form.endDate)
    : 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await requestLeave({
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
      });
      toast.success("Pengajuan cuti terkirim", {
        description: "Menunggu persetujuan atasan langsung.",
      });
      setDialogOpen(false);
      setForm({ type: LEAVE_TYPE.CUTI, startDate: "", endDate: "", reason: "" });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Portal Karyawan"
        description="Data pribadi, absensi, cuti, slip gaji, dan dokumen Anda sendiri."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Portal Karyawan" }]}
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <CalendarPlus className="size-4" />
            Ajukan Cuti
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Kehadiran bulan ini"
          value={overview.counters.hadir}
          hint={`${overview.counters.alpa} alpa · ${overview.counters.terlambat} terlambat`}
          icon={CalendarDays}
          tone="emerald"
        />
        <KpiCard
          label="Lembur"
          value={`${formatNumber(overview.counters.lembur)} menit`}
          icon={TrendingUp}
          tone="sky"
        />
        <KpiCard
          label="Cuti menunggu"
          value={overview.counters.cutiPending}
          hint="Pengajuan berstatus pending"
          icon={CalendarDays}
          tone="amber"
        />
        <KpiCard
          label="Slip gaji terakhir"
          value={overview.counters.slipTerakhir ? formatCurrency(overview.counters.slipTerakhir.netPay) : "—"}
          hint={overview.counters.slipTerakhir ? `Periode ${overview.counters.slipTerakhir.period}` : "Belum ada slip gaji"}
          icon={Wallet}
          tone="navy"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
              tab === item.key
                ? "bg-navy-900 text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === "ringkasan" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Data diri" description="Data ini diperbarui oleh bagian HRD.">
            <dl className="divide-y divide-border">
              <InfoRow label="Nama lengkap" value={overview.profile.namaLengkap} />
              <InfoRow label="NIY" value={overview.profile.niy} mono />
              <InfoRow label="Bidang / Unit" value={overview.profile.bidang} />
              <InfoRow label="Jabatan" value={overview.profile.jabatan} />
              <InfoRow label="Status" value={<StatusBadge value={overview.profile.status} />} />
              <InfoRow label="Tanggal bergabung" value={formatDate(overview.profile.tanggalBergabung)} />
              <InfoRow label="Masa kerja" value={overview.profile.masaKerja} />
            </dl>
          </SectionCard>

          <div className="space-y-4">
            <SectionCard title="Kontrak" description="Periode kontrak kerja aktif.">
              {overview.contract ? (
                <dl className="divide-y divide-border">
                  <InfoRow label="Nomor" value={overview.contract.nomor} mono />
                  <InfoRow label="Jenis" value={overview.contract.type} />
                  <InfoRow label="Mulai" value={formatDate(overview.contract.mulai)} />
                  <InfoRow label="Selesai" value={formatDate(overview.contract.selesai)} />
                  <InfoRow
                    label="Status"
                    value={<StatusBadge value={overview.contract.status} label="Aktif" />}
                  />
                </dl>
              ) : (
                <EmptyState title="Belum ada kontrak aktif" description="Hubungi HRD jika ini keliru." />
              )}
            </SectionCard>

            <SectionCard title="Saldo cuti" description={`Tahun ${new Date().getFullYear()}`}>
              {overview.balances.length ? (
                <dl className="divide-y divide-border">
                  {overview.balances.map((balance) => (
                    <InfoRow
                      key={balance.type}
                      label={LEAVE_TYPE_LABELS[balance.type as LeaveType] ?? balance.type}
                      value={`${balance.remaining} dari ${balance.entitled} hari`}
                    />
                  ))}
                </dl>
              ) : (
                <EmptyState title="Saldo cuti belum diatur" description="HRD belum menetapkan jatah cuti Anda." />
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {showAttendance && (
        <SectionCard
          title="Riwayat absensi"
          description={`Periode ${formatPeriodLabel(period)}`}
          actions={
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setPeriod(shiftPeriod(period, -1))}>
                Sebelumnya
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPeriod(shiftPeriod(period, 1))}>
                Berikutnya
              </Button>
            </div>
          }
        >
          {attendance === undefined ? (
            <LoadingState label="Memuat absensi…" />
          ) : attendance.length === 0 ? (
            <EmptyState title="Belum ada data absensi" description={`Tidak ada catatan pada ${formatPeriodLabel(period)}.`} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Masuk</TableHead>
                    <TableHead>Pulang</TableHead>
                    <TableHead className="text-right">Telat</TableHead>
                    <TableHead className="text-right">Lembur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendance.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                      <TableCell><StatusBadge value={row.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{row.checkIn ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.checkOut ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.lateMinutes ?? 0}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.overtimeMinutes ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      )}

      {showLeave && (
        <div className="space-y-4">
          <SectionCard
            title="Pengajuan cuti & izin"
            description="Status dan riwayat keputusan atasan."
            actions={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <CalendarPlus className="size-4" />
                Ajukan
              </Button>
            }
          >
            {leave === undefined ? (
              <LoadingState label="Memuat pengajuan…" />
            ) : leave.requests.length === 0 ? (
              <EmptyState title="Belum ada pengajuan" description="Ajukan cuti pertama Anda lewat tombol di atas." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead className="text-right">Hari</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Keputusan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leave.requests.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{row.nomor}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {LEAVE_TYPE_LABELS[row.type as LeaveType] ?? row.type}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDate(row.startDate)} – {formatDate(row.endDate)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{row.totalDays}</TableCell>
                        <TableCell><StatusBadge value={row.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.decidedByName ? (
                            <>
                              {row.decidedByName}
                              <span className="block text-[11px]">
                                {row.decisionNote || formatDateTime(row.decidedAt)}
                              </span>
                            </>
                          ) : (
                            "Menunggu"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {showPayslips && (
        <SectionCard
          title="Slip gaji"
          description="Rincian gaji per periode. Gunakan Cetak untuk menyimpan sebagai PDF."
        >
          {payslips === undefined ? (
            <LoadingState label="Memuat slip gaji…" />
          ) : payslips.length === 0 ? (
            <EmptyState title="Belum ada slip gaji" description="Slip gaji muncul setelah HRD membuat periode payroll." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Gaji Pokok</TableHead>
                    <TableHead className="text-right">Total Pendapatan</TableHead>
                    <TableHead className="text-right">Potongan</TableHead>
                    <TableHead className="text-right">Diterima</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">{row.period}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatCurrency(row.baseSalary)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatCurrency(row.totalEarnings)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatCurrency(row.totalDeductions)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {formatCurrency(row.netPay)}
                      </TableCell>
                      <TableCell><StatusBadge value={row.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outlineNavy"
                          onClick={() =>
                            printPayslip({
                              period: row.period,
                              namaLengkap: overview.profile.namaLengkap,
                              niy: overview.profile.niy,
                              jabatan: overview.profile.jabatan,
                              bidang: overview.profile.bidang,
                              baseSalary: row.baseSalary,
                              lines: row.lines,
                              totalEarnings: row.totalEarnings,
                              totalDeductions: row.totalDeductions,
                              netPay: row.netPay,
                            })
                          }
                        >
                          <FileText className="size-3.5" />
                          Cetak
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      )}

      {showDocuments && (
        <SectionCard
          title="Dokumen saya"
          description="Dokumen yang diunggah HRD untuk data Anda. Unduh file melalui HRD."
        >
          {documents === undefined ? (
            <LoadingState label="Memuat dokumen…" />
          ) : documents.length === 0 ? (
            <EmptyState title="Belum ada dokumen" description="Hubungi HRD bila ada berkas yang perlu dilampirkan." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Terbit</TableHead>
                    <TableHead>Berlaku Sampai</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.category}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(row.issuedDate)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(row.expiryDate)}</TableCell>
                      <TableCell><StatusBadge value={row.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Ajukan Cuti</DialogTitle>
              <DialogDescription>
                Pengajuan diteruskan ke atasan langsung. Peran Anda:{" "}
                {ROLE_LABELS[overview.account.role as Role] ?? overview.account.role}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="leave-type">Jenis</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm((f) => ({ ...f, type: value }))}
                >
                  <SelectTrigger id="leave-type">
                    <SelectValue placeholder="Pilih jenis" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(LEAVE_TYPE).map((type) => (
                      <SelectItem key={type} value={type}>
                        {LEAVE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="leave-start">Mulai</Label>
                  <Input
                    id="leave-start"
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="leave-end">Selesai</Label>
                  <Input
                    id="leave-end"
                    type="date"
                    required
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              {totalDays > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total {totalDays} hari kerja (Sabtu–Minggu tidak dihitung).
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="leave-reason">Alasan</Label>
                <Textarea
                  id="leave-reason"
                  required
                  minLength={5}
                  rows={3}
                  placeholder="Jelaskan singkat alasan pengajuan (minimal 5 karakter)."
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Mengirim…" : "Kirim Pengajuan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const names = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${names[month - 1] ?? period} ${year}`;
}
