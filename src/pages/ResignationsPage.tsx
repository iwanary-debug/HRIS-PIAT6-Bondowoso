/**
 * Resign / Terminasi — exit records with a clearance checklist. Completing
 * clearance flips the employee status (RESIGN/TERMINASI); the record itself is
 * never deleted, so history survives.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { DoorOpen, Plus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, LoadingState, describeError } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/overlays";
import { useAuth } from "@/providers/AuthProvider";
import { formatDate } from "@/lib/format";
import {
  CLEARANCE_ITEM_LABELS,
  RESIGNATION_STATUS,
  RESIGNATION_STATUS_LABELS,
  RESIGNATION_TYPE,
  RESIGNATION_TYPE_LABELS,
  type ClearanceItem,
} from "@/domain/lifecycle";
import type { Id } from "../../convex/_generated/dataModel";

interface ResignationRow {
  id: string;
  employeeId: string;
  namaLengkap: string;
  niy: string;
  bidang?: string;
  jabatan?: string;
  nomor: string;
  type: string;
  lastWorkingDate: string;
  reason: string;
  status: string;
  clearances: { item: string; label: string; cleared: boolean; clearedBy?: string }[];
  progress: { total: number; cleared: number; percent: number };
  notes?: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Diajukan",
  IN_CLEARANCE: "Proses Clearance",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

export default function ResignationsPage() {
  const { can } = useAuth();
  const canEdit = can("HR_EDIT");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [clearanceTarget, setClearanceTarget] = React.useState<ResignationRow | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    employeeId: "",
    type: RESIGNATION_TYPE.RESIGN as string,
    lastWorkingDate: new Date().toISOString().slice(0, 10),
    reason: "",
    notes: "",
  });

  const resignations = useQuery(api.lifecycle.resignationList, {
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const summary = useQuery(api.lifecycle.clearances, {});
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const saveMutation = useMutation(api.lifecycle.resignationSave);
  const setClearanceMutation = useMutation(api.lifecycle.setClearance);

  const handleCreate = async () => {
    if (!form.employeeId) {
      toast.error("Pilih karyawan terlebih dahulu.");
      return;
    }
    if (form.reason.trim().length < 5) {
      toast.error("Alasan minimal 5 karakter.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveMutation({
        employeeId: form.employeeId as Id<"employees">,
        type: form.type,
        lastWorkingDate: form.lastWorkingDate,
        reason: form.reason.trim(),
        notes: form.notes || undefined,
      });
      toast.success(`Pengunduran ${result.nomor} tercatat`, { description: "Lanjutkan ke checklist clearance." });
      setCreateOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClearance = async (row: ResignationRow, item: string, cleared: boolean) => {
    try {
      await setClearanceMutation({ id: row.id as Id<"resignations">, item, cleared });
      if (cleared && row.progress.cleared + 1 >= row.progress.total) {
        toast.success("Seluruh clearance selesai — status karyawan diperbarui otomatis.");
      }
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleAdvance = async (row: ResignationRow, status: string) => {
    try {
      await saveMutation({
        id: row.id as Id<"resignations">,
        employeeId: row.employeeId as Id<"employees">,
        type: row.type,
        lastWorkingDate: row.lastWorkingDate,
        reason: row.reason,
        status,
      });
      toast.success(`Status → ${STATUS_LABELS[status] ?? status}`);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const rows = (resignations ?? []) as ResignationRow[];

  return (
    <>
      <PageHeader
        title="Resign / Terminasi"
        description="Proses keluar karyawan dengan checklist clearance. Data karyawan tidak pernah dihapus — statusnya berubah dan seluruh histori tetap tersimpan."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Resign / Terminasi" }]}
        actions={
          canEdit && (
            <Button
              onClick={() => {
                setForm((f) => ({ ...f, employeeId: "", reason: "", notes: "" }));
                setCreateOpen(true);
              }}
            >
              <Plus /> Catat Pengunduran
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Diajukan" value={summary?.pending ?? 0} icon={DoorOpen} tone="amber" />
        <KpiCard label="Proses Clearance" value={summary?.inClearance ?? 0} icon={DoorOpen} tone="sky" />
        <KpiCard label="Selesai" value={summary?.completed ?? 0} icon={DoorOpen} tone="emerald" />
        <KpiCard label="Rata-rata Clearance" value={`${summary?.averageProgress ?? 0}%`} icon={DoorOpen} tone="slate" />
      </div>

      <SectionCard
        title="Daftar pengunduran"
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {resignations === undefined ? (
          <LoadingState label="Memuat pengunduran…" />
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada pengunduran" description="Semua karyawan masih aktif — kabar baik." className="border-0" />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <Card key={row.id} className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">
                        {row.nomor} · {RESIGNATION_TYPE_LABELS[row.type as keyof typeof RESIGNATION_TYPE_LABELS] ?? row.type}
                      </p>
                      <StatusBadge
                        value={row.status === "COMPLETED" ? "APPROVED" : row.status === "IN_CLEARANCE" ? "IN_CLEARANCE" : row.status === "CANCELLED" ? "CANCELLED" : "PENDING"}
                        label={RESIGNATION_STATUS_LABELS[row.status as keyof typeof RESIGNATION_STATUS_LABELS] ?? row.status}
                      />
                    </div>
                    <p className="mt-0.5 text-sm">
                      <Link to={`/app/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                        {row.namaLengkap}
                      </Link>{" "}
                      <span className="text-xs text-muted-foreground">
                        ({row.niy} · {row.jabatan ?? "—"} · {row.bidang ?? "—"})
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Hari terakhir kerja {formatDate(row.lastWorkingDate)} · {row.reason}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Clearance</p>
                      <p className="text-sm font-bold tabular-nums">{row.progress.percent}%</p>
                    </div>
                    {canEdit && row.status !== RESIGNATION_STATUS.COMPLETED && (
                      <>
                        {row.status === RESIGNATION_STATUS.PENDING && (
                          <Button variant="outlineNavy" size="sm" onClick={() => void handleAdvance(row, RESIGNATION_STATUS.IN_CLEARANCE)}>
                            Proses Clearance
                          </Button>
                        )}
                        <Button variant="outlineNavy" size="sm" onClick={() => setClearanceTarget(row)}>
                          Checklist
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
                  {row.clearances.map((clearance) => (
                    <span
                      key={clearance.item}
                      className={`rounded-md border px-2 py-1 text-center text-[11px] ${
                        clearance.cleared
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-border bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      {CLEARANCE_ITEM_LABELS[clearance.item as ClearanceItem] ?? clearance.label}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Catat pengunduran / terminasi</DialogTitle>
            <DialogDescription>
              Nomor otomatis (RES/tahun/urutan). Status karyawan baru berubah saat clearance selesai atau status
              diubah manual ke Selesai.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Karyawan</Label>
              <Select value={form.employeeId} onValueChange={(value) => setForm((f) => ({ ...f, employeeId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan aktif" /></SelectTrigger>
                <SelectContent>
                  {(employees?.data ?? []).map((employee) => (
                    <SelectItem key={employee._id} value={employee._id}>{employee.namaLengkap} — {employee.niy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <Select value={form.type} onValueChange={(value) => setForm((f) => ({ ...f, type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RESIGNATION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hari terakhir kerja</Label>
              <Input type="date" value={form.lastWorkingDate} onChange={(event) => setForm((f) => ({ ...f, lastWorkingDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Alasan</Label>
              <Textarea value={form.reason} onChange={(event) => setForm((f) => ({ ...f, reason: event.target.value }))} placeholder="Minimal 5 karakter…" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clearance dialog */}
      <Dialog open={!!clearanceTarget} onOpenChange={(open) => !open && setClearanceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clearance — {clearanceTarget?.nomor}</DialogTitle>
            <DialogDescription>
              {clearanceTarget?.namaLengkap}. Tandai selesai per penanggung jawab; seluruh item selesai mengubah
              status menjadi Selesai dan status karyawan ikut diperbarui.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(clearanceTarget?.clearances ?? []).map((clearance) => (
              <label
                key={clearance.item}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 transition hover:bg-muted/40"
              >
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {CLEARANCE_ITEM_LABELS[clearance.item as ClearanceItem] ?? clearance.label}
                  </span>
                  {clearance.clearedBy && (
                    <span className="block text-xs text-muted-foreground">Diselesaikan oleh {clearance.clearedBy}</span>
                  )}
                </span>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={clearance.cleared}
                  onChange={(event) => {
                    const row = clearanceTarget;
                    if (row) void handleToggleClearance(row, clearance.item, event.target.checked);
                  }}
                />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearanceTarget(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
