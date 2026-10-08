import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import {
  Activity,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  FileWarning,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { BarListRow, SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, LoadingState } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/input";
import { formatDate, formatNumber, formatPercent, formatTimeAgo } from "@/lib/format";
import { MONTHS_LONG, DAYS_SHORT } from "@/lib/format";

const CHART_COLORS = ["#1d3b7c", "#3360ba", "#5482d0", "#86aae1", "#b5cdee", "#d8e6f6", "#254a9b"];

const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export default function DashboardPage() {
  const [period, setPeriod] = React.useState(currentPeriod());
  const [bidangId, setBidangId] = React.useState<string>("all");
  const [jabatanId, setJabatanId] = React.useState<string>("all");
  const [status, setStatus] = React.useState<string>("all");

  const filter = {
    period,
    bidangId: bidangId === "all" ? undefined : (bidangId as never),
    jabatanId: jabatanId === "all" ? undefined : (jabatanId as never),
    status: status === "all" ? undefined : status,
  };

  const kpis = useQuery(api.dashboard.kpis, filter);
  const breakdowns = useQuery(api.dashboard.breakdowns, {
    bidangId: filter.bidangId,
    jabatanId: filter.jabatanId,
    status: filter.status,
  });
  const watch = useQuery(api.dashboard.contractWatch, { limit: 8 });
  const approvals = useQuery(api.dashboard.pendingApprovals, {});
  const activity = useQuery(api.dashboard.recentActivity, { limit: 8 });
  const trend = useQuery(api.dashboard.attendanceTrend, { period });
  const units = useQuery(api.organization.listUnits, {});
  const positions = useQuery(api.organization.listPositions, {});
  const setup = useQuery(api.seed.status, {});

  if (kpis === undefined || breakdowns === undefined) {
    return <LoadingState label="Menghitung indikator HR…" />;
  }

  if (kpis.total === 0 && setup?.employees === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard HR"
          description="Ringkasan kondisi SDM PIAT 6 Bondowoso."
        />
        <EmptyState
          icon={Users}
          title="Belum ada data karyawan"
          description="Siapkan data referensi lalu muat data contoh melalui menu Import Data. Data contoh di repository ini fiktif dan aman untuk demonstrasi; data karyawan produksi diimpor melalui menu yang sama."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/app/settings">Siapkan Data Referensi</Link>
              </Button>
              <Button variant="outlineNavy" asChild>
                <Link to="/app/import">Import Data</Link>
              </Button>
            </div>
          }
        />
      </>
    );
  }

  const chartData = breakdowns.perBidang.slice(0, 8);
  const akadData = breakdowns.perStatusAkad.map((row) => ({
    name: row.name,
    value: row.value,
  }));
  const pendidikanData = breakdowns.perPendidikan;

  return (
    <>
      <PageHeader
        title="Dashboard HR"
        description="Ringkasan kondisi sumber daya manusia PIAT 6 Bondowoso berdasarkan data live."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 6 }, (_, index) => {
                  const now = new Date();
                  const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
                  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
                  return (
                    <SelectItem key={value} value={value}>
                      {MONTHS_LONG[date.getMonth()]} {date.getFullYear()}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={bidangId} onValueChange={setBidangId}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Semua bidang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua bidang</SelectItem>
                {(units ?? []).map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={jabatanId} onValueChange={setJabatanId}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Semua jabatan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jabatan</SelectItem>
                {(positions ?? []).map((position) => (
                  <SelectItem key={position.id} value={position.id}>
                    {position.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[130px]">
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="AKTIF">Aktif</SelectItem>
                <SelectItem value="TIDAK_AKTIF">Tidak Aktif</SelectItem>
                <SelectItem value="RESIGN">Resign</SelectItem>
                <SelectItem value="TERMINASI">Terminasi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Total Karyawan" value={formatNumber(kpis.total)} icon={Users} to="/app/employees" />
        <KpiCard label="Karyawan Aktif" value={formatNumber(kpis.aktif)} icon={UserCheck} tone="emerald" to="/app/employees" />
        <KpiCard label="Resign / Nonaktif" value={formatNumber(kpis.nonAktif)} icon={UserMinus} tone="slate" />
        <KpiCard label="PKWT" value={formatNumber(kpis.pkwt)} icon={Activity} tone="sky" />
        <KpiCard label="PKWTT" value={formatNumber(kpis.pkwtt)} icon={Activity} tone="sky" />
        <KpiCard
          label="Kontrak Perlu Perhatian"
          value={formatNumber(kpis.kontrakPerluPerhatian)}
          hint={kpis.kontrakLewat > 0 ? `${kpis.kontrakLewat} sudah lewat jatuh tempo` : "Tidak ada yang lewat"}
          icon={CalendarClock}
          tone={kpis.kontrakLewat > 0 ? "red" : "amber"}
          to="/app/contracts"
        />
        <KpiCard
          label="Cuti / Izin Pending"
          value={formatNumber(kpis.cutiPending)}
          icon={CalendarDays}
          tone="amber"
          to="/app/leave"
        />
        <KpiCard
          label="Kehadiran"
          value={formatPercent(kpis.kehadiran, 0)}
          hint={`${formatNumber(kpis.hadirBulanIni)} hari hadir · ${formatNumber(kpis.terlambat)} terlambat`}
          icon={TrendingUp}
          tone={kpis.kehadiran >= 90 ? "emerald" : "amber"}
          to="/app/attendance"
        />
      </div>

      {/* Analysis */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Karyawan per Bidang"
          description={`${formatNumber(kpis.aktif)} karyawan aktif`}
          className="lg:col-span-2"
        >
          {chartData.length === 0 ? (
            <EmptyState title="Belum ada karyawan aktif" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(29,59,124,0.06)" }}
                    contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", fontSize: 12 }}
                  />
                  <Bar dataKey="value" name="Karyawan" fill="#1d3b7c" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Status Akad" description="PKWT vs PKWTT">
          {akadData.length === 0 ? (
            <EmptyState title="Belum ada data" />
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={akadData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={46}
                      outerRadius={74}
                      paddingAngle={3}
                    >
                      {akadData.map((entry, index) => (
                        <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", fontSize: 12 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <dl className="mt-3 space-y-1.5">
                {akadData.map((row) => (
                  <div key={row.name} className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">{row.name}</dt>
                    <dd className="font-semibold tabular-nums">{formatNumber(row.value)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Karyawan per Jabatan" description="10 jabatan teratas">
          {breakdowns.perJabatan.length === 0 ? (
            <EmptyState title="Belum ada jabatan terisi" />
          ) : (
            <div className="space-y-3">
              {breakdowns.perJabatan.map((row) => (
                <BarListRow
                  key={row.name}
                  label={row.name}
                  value={row.value}
                  max={breakdowns.perJabatan[0]?.value ?? 1}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Pendidikan Terakhir" description="Sebaran jenjang karyawan aktif">
          {pendidikanData.length === 0 ? (
            <EmptyState title="Belum ada data pendidikan" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pendidikanData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(29,59,124,0.06)" }}
                    contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", fontSize: 12 }}
                  />
                  <Bar dataKey="value" name="Karyawan" fill="#3360ba" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Masa Kerja" description="Dihitung dari tanggal bergabung">
          <div className="space-y-3">
            {breakdowns.perMasaKerja.map((row, index) => (
              <BarListRow
                key={row.name}
                label={row.name}
                value={row.value}
                max={Math.max(...breakdowns.perMasaKerja.map((r) => r.value), 1)}
                tone={index === 0 ? "sky" : index === breakdowns.perMasaKerja.length - 1 ? "navy" : "emerald"}
              />
            ))}
          </div>
          <div className="mt-5 border-t border-border/70 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Status Pernikahan
            </p>
            <dl className="mt-2 space-y-1.5">
              {breakdowns.perStatusPernikahan.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum diisi pada data karyawan.</p>
              ) : (
                breakdowns.perStatusPernikahan.map((row) => (
                  <div key={row.name} className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">
                      {row.name.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                    </dt>
                    <dd className="font-semibold tabular-nums">{formatNumber(row.value)}</dd>
                  </div>
                ))
              )}
            </dl>
          </div>
        </SectionCard>
      </div>

      {/* Operations */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Kontrak Akan Berakhir"
          description="Aman · Mendekati · Perlu tindakan · Sudah lewat"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/contracts">Lihat semua</Link>
            </Button>
          }
        >
          {(watch ?? []).length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Semua kontrak aman"
              description="Tidak ada kontrak aktif yang mendekati atau melewati jatuh tempo."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {(watch ?? []).map((row) => (
                <li key={row.contractId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/app/employees/${row.employeeId}`}
                      className="block truncate text-sm font-medium hover:text-primary"
                    >
                      {row.namaLengkap}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.niy} · {row.bidang ?? "Tanpa unit"} · berakhir {formatDate(row.selesai)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge value={row.status} />
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.daysRemaining < 0
                        ? `lewat ${Math.abs(row.daysRemaining)} hari`
                        : `${row.daysRemaining} hari lagi`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Pengajuan Pending"
          description="Cuti, izin, dan pengunduran yang perlu ditinjau"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/leave">Buka antrean</Link>
            </Button>
          }
        >
          {approvals && (approvals.leave.length > 0 || approvals.resignations.length > 0) ? (
            <ul className="divide-y divide-border/70">
              {approvals.leave.slice(0, 5).map((row) => (
                <li key={row.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.employee}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.type} · {formatDate(row.startDate)} – {formatDate(row.endDate)} ·{" "}
                      {row.totalDays} hari
                    </p>
                  </div>
                  <StatusBadge value="PENDING" label="Menunggu" />
                </li>
              ))}
              {approvals.resignations.slice(0, 3).map((row) => (
                <li key={row.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.employee}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.type} · hari terakhir {formatDate(row.lastWorkingDate)}
                    </p>
                  </div>
                  <StatusBadge value={row.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Tidak ada pengajuan menunggu"
              description="Semua pengajuan cuti dan izin sudah diproses."
            />
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Kehadiran Harian" description={`Bulan ${MONTHS_LONG[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`}>
          {!trend || trend.length === 0 ? (
            <EmptyState title="Belum ada data kehadiran bulan ini" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", fontSize: 12 }}
                    labelFormatter={(_label, payload) =>
                      payload?.[0] ? formatDate(String(payload[0].payload.date)) : ""
                    }
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="hadir" name="Hadir" stackId="a" fill="#1d3b7c" />
                  <Bar dataKey="izin" name="Izin" stackId="a" fill="#86aae1" />
                  <Bar dataKey="sakit" name="Sakit" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="alfa" name="Alfa" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Kelengkapan Dokumen" description="KTP, Ijazah, dan SK terverifikasi">
          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
                  <FileWarning className="size-5" />
                </span>
                <div>
                  <p className="text-2xl font-bold leading-none">
                    {formatNumber(kpis.dokumenBelumLengkap)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    karyawan aktif belum lengkap
                  </p>
                </div>
              </div>
            </div>
            <Button variant="outlineNavy" className="w-full" asChild>
              <Link to="/app/documents">Kelola dokumen</Link>
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Dokumen diunggah lewat aplikasi dan disimpan di storage terisolasi — tidak
              pernah masuk ke repository GitHub.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Aktivitas HR Terbaru" description="Jejak audit terbaru">
          {!activity || activity.length === 0 ? (
            <EmptyState title="Belum ada aktivitas" description="Jejak audit akan muncul di sini." />
          ) : (
            <ul className="space-y-3">
              {activity.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-navy-300" />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{entry.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.actorName} · {formatTimeAgo(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <Card className="mt-4 border-dashed">
        <CardContent className="flex flex-col gap-2 p-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Angka pada halaman ini dihitung langsung dari tabel karyawan, kontrak, kehadiran,
            dan pengajuan — tidak ada KPI yang disimpan manual.
          </p>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-3.5" />
            <span>
              Legenda hari: {DAYS_SHORT.join(" ")} · {formatNumber(kpis.sakit)} sakit ·{" "}
              {formatNumber(kpis.alfa)} alfa
            </span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
