/**
 * Kehadiran — daily board (bulk record), monthly rekap with filters and the
 * per-employee summary. Capture stays device-agnostic (source MANUAL/WEB/…).
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { CalendarCheck, Save, Settings2, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, LoadingState, describeError } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/input";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/overlays";
import { useAuth } from "@/providers/AuthProvider";
import { formatDate } from "@/lib/format";
import type { Id } from "../../convex/_generated/dataModel";

const STATUS_CHOICES = ["HADIR", "IZIN", "SAKIT", "ALFA", "CUTI", "LIBUR", "DINAS_LUAR"] as const;

export default function AttendancePage() {
  const { can } = useAuth();
  const canEdit = can("HR_ATTENDANCE_EDIT");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = React.useState(new Date().toISOString().slice(0, 7));
  const [bidangId, setBidangId] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [drafts, setDrafts] = React.useState<Record<string, { status: string; checkIn: string; checkOut: string }>>({});
  const [saving, setSaving] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsForm, setSettingsForm] = React.useState({ workStart: "07:00", workEnd: "15:00", lateThreshold: 15 });

  const units = useQuery(api.organization.listUnits, {});
  const settings = useQuery(api.attendance.workSettings, {});
  const board = useQuery(api.attendance.dailyBoard, { date, bidangId: bidangId === "all" ? undefined : (bidangId as Id<"organizationUnits">) });
  const list = useQuery(api.attendance.list, {
    period,
    bidangId: bidangId === "all" ? undefined : (bidangId as Id<"organizationUnits">),
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const summary = useQuery(api.attendance.summaryByEmployee, {
    period,
    bidangId: bidangId === "all" ? undefined : (bidangId as Id<"organizationUnits">),
  });

  const recordBulkMutation = useMutation(api.attendance.recordBulk);
  const setWorkSettingsMutation = useMutation(api.attendance.setWorkSettings);

  React.useEffect(() => {
    if (settings) setSettingsForm({ workStart: settings.workStart, workEnd: settings.workEnd, lateThreshold: settings.lateThreshold });
  }, [settings]);

  const draftFor = (employeeId: string) =>
    drafts[employeeId] ?? { status: "", checkIn: "", checkOut: "" };

  const setDraft = (employeeId: string, patch: Partial<{ status: string; checkIn: string; checkOut: string }>) =>
    setDrafts((current) => ({ ...current, [employeeId]: { ...draftFor(employeeId), ...patch } }));

  const saveBulk = async () => {
    const entries = Object.entries(drafts)
      .filter(([, draft]) => draft.status !== "")
      .map(([employeeId, draft]) => ({
        employeeId: employeeId as Id<"employees">,
        status: draft.status,
        checkIn: draft.checkIn || null,
        checkOut: draft.checkOut || null,
      }));
    if (entries.length === 0) {
      toast.error("Belum ada perubahan untuk disimpan.");
      return;
    }
    setSaving(true);
    try {
      const result = await recordBulkMutation({ date, entries, source: "MANUAL" });
      toast.success(`${result.upserted} catatan kehadiran tersimpan untuk ${formatDate(date)}`);
      setDrafts({});
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await setWorkSettingsMutation(settingsForm);
      toast.success("Jam kerja diperbarui");
      setSettingsOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const recorded = board?.filter((row) => row.recorded).length ?? 0;
  const hadir = board?.filter((row) => row.status === "HADIR").length ?? 0;
  const alfa = board?.filter((row) => row.status === "ALFA").length ?? 0;

  return (
    <>
      <PageHeader
        title="Kehadiran"
        description="Rekap harian dan bulanan dengan sumber perangkat terbuka (manual, web, mobile, fingerprint, RFID, QR) — siap integrasi tanpa mengubah data model."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Kehadiran" }]}
        actions={
          can("HR_SETTINGS") && (
            <Button variant="outlineNavy" onClick={() => setSettingsOpen(true)}>
              <Settings2 /> Jam Kerja
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Karyawan Aktif" value={board?.length ?? 0} icon={Users} />
        <KpiCard label="Tercatat" value={recorded} icon={CalendarCheck} tone="sky" hint={formatDate(date)} />
        <KpiCard label="Hadir" value={hadir} icon={CalendarCheck} tone="emerald" />
        <KpiCard label="Alfa" value={alfa} icon={CalendarCheck} tone="red" />
      </div>

      <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs text-muted-foreground">Tanggal</Label>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-40" />
          <Label className="text-xs text-muted-foreground">Bulan rekap</Label>
          <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="w-40" />
        </div>
        <Select value={bidangId} onValueChange={setBidangId}>
          <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Bidang" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua bidang</SelectItem>
            {(units ?? []).map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>{unit.nama}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {STATUS_CHOICES.map((value) => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {settings && (
          <p className="ml-auto text-xs text-muted-foreground">
            Jam kerja {settings.workStart}–{settings.workEnd} · toleransi {settings.lateThreshold} menit
          </p>
        )}
      </Card>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board"><CalendarCheck /> Papan Harian</TabsTrigger>
          <TabsTrigger value="rekap"><Users /> Rekap Bulanan</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <SectionCard
            title={`Papan kehadiran ${formatDate(date)}`}
            description="Isi status untuk karyawan yang belum tercatat, lalu simpan sekaligus."
            actions={
              canEdit && (
                <Button onClick={saveBulk} disabled={saving || Object.keys(drafts).length === 0}>
                  <Save /> Simpan ({Object.entries(drafts).filter(([, d]) => d.status).length})
                </Button>
              )
            }
          >
            {board === undefined ? (
              <LoadingState label="Memuat papan…" />
            ) : board.length === 0 ? (
              <EmptyState title="Tidak ada karyawan aktif" description="Tambahkan karyawan atau ubah filter bidang." className="border-0" />
            ) : (
              <div className="max-h-[560px] overflow-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Tercatat</TableHead>
                      <TableHead>Status</TableHead>
                      {canEdit && <TableHead>Masuk</TableHead>}
                      {canEdit && <TableHead>Keluar</TableHead>}
                      <TableHead>Terlambat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {board.map((row) => {
                      const draft = draftFor(row.employeeId);
                      return (
                        <TableRow key={row.employeeId}>
                          <TableCell>
                            <Link to={`/app/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                              {row.namaLengkap}
                            </Link>
                            <p className="text-xs text-muted-foreground">{row.niy} · {row.jabatan ?? "—"}</p>
                          </TableCell>
                          <TableCell>
                            {row.recorded ? (
                              <StatusBadge value={row.status ?? "HADIR"} />
                            ) : (
                              <span className="text-xs text-muted-foreground">Belum</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.recorded ? (
                              <span className="text-xs text-muted-foreground">{row.checkIn ?? "—"}–{row.checkOut ?? "—"}</span>
                            ) : canEdit ? (
                              <Select
                                value={draft.status || "__none"}
                                onValueChange={(value) => setDraft(row.employeeId, { status: value === "__none" ? "" : value })}
                              >
                                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Pilih…" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none">—</SelectItem>
                                  {STATUS_CHOICES.map((value) => (
                                    <SelectItem key={value} value={value}>{value}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          {canEdit && !row.recorded && (
                            <>
                              <TableCell>
                                <Input
                                  type="time"
                                  value={draft.checkIn}
                                  onChange={(event) => setDraft(row.employeeId, { checkIn: event.target.value })}
                                  className="h-8 w-28"
                                  disabled={!draft.status}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="time"
                                  value={draft.checkOut}
                                  onChange={(event) => setDraft(row.employeeId, { checkOut: event.target.value })}
                                  className="h-8 w-28"
                                  disabled={!draft.status}
                                />
                              </TableCell>
                            </>
                          )}
                          {canEdit && row.recorded && (
                            <>
                              <TableCell colSpan={2} className="text-xs text-muted-foreground">
                                Sudah tercatat — perubahan lewat rekap
                              </TableCell>
                            </>
                          )}
                          <TableCell className={row.lateMinutes ? "text-red-700" : "text-muted-foreground"}>
                            {row.lateMinutes ? `${row.lateMinutes} mnt` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="rekap">
          <div className="grid gap-4">
            <SectionCard
              title={`Rekap per karyawan — ${period}`}
              description="Diurutkan dari tingkat kehadiran terendah. Hari kerja diasumsikan 22 hari."
            >
              {summary === undefined ? (
                <LoadingState label="Menghitung rekap…" />
              ) : summary.length === 0 ? (
                <EmptyState title="Belum ada data kehadiran" description="Catat kehadiran melalui papan harian." className="border-0" />
              ) : (
                <div className="max-h-[560px] overflow-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Karyawan</TableHead>
                        <TableHead>Hadir</TableHead>
                        <TableHead>Izin</TableHead>
                        <TableHead>Sakit</TableHead>
                        <TableHead>Cuti</TableHead>
                        <TableHead>Alfa</TableHead>
                        <TableHead>Terlambat</TableHead>
                        <TableHead>%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.map((row) => (
                        <TableRow key={row.employeeId}>
                          <TableCell>
                            <Link to={`/app/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                              {row.namaLengkap}
                            </Link>
                            <p className="text-xs text-muted-foreground">{row.bidang ?? "—"}</p>
                          </TableCell>
                          <TableCell className="tabular-nums">{row.hadir}</TableCell>
                          <TableCell className="tabular-nums">{row.izin}</TableCell>
                          <TableCell className="tabular-nums">{row.sakit}</TableCell>
                          <TableCell className="tabular-nums">{row.cuti}</TableCell>
                          <TableCell className={`tabular-nums ${row.alfa > 0 ? "text-red-700" : ""}`}>{row.alfa}</TableCell>
                          <TableCell className={`tabular-nums ${row.late > 0 ? "text-amber-700" : ""}`}>{row.late}</TableCell>
                          <TableCell className="font-semibold tabular-nums">{row.attendanceRate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>

            <SectionCard title={`Catatan individual — ${period}`} description="Rincian catatan pada periode terpilih.">
              {list === undefined ? (
                <LoadingState label="Memuat catatan…" />
              ) : list.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada catatan pada periode ini.</p>
              ) : (
                <div className="max-h-[420px] overflow-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Karyawan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Masuk</TableHead>
                        <TableHead>Keluar</TableHead>
                        <TableHead>Sumber</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.slice(0, 200).map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell>{record.namaLengkap}</TableCell>
                          <TableCell><StatusBadge value={record.status} /></TableCell>
                          <TableCell>{record.checkIn ?? "—"}</TableCell>
                          <TableCell>{record.checkOut ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{record.source}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>

      {/* Work settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jam kerja & toleransi terlambat</DialogTitle>
            <DialogDescription>
              Dipakai untuk menghitung keterlambatan dan lembur otomatis pada setiap pencatatan kehadiran.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Mulai</Label>
              <Input type="time" value={settingsForm.workStart} onChange={(event) => setSettingsForm((f) => ({ ...f, workStart: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Selesai</Label>
              <Input type="time" value={settingsForm.workEnd} onChange={(event) => setSettingsForm((f) => ({ ...f, workEnd: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Toleransi (mnt)</Label>
              <Input
                type="number"
                value={settingsForm.lateThreshold}
                onChange={(event) => setSettingsForm((f) => ({ ...f, lateThreshold: Number(event.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Batal</Button>
            <Button onClick={saveSettings} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
