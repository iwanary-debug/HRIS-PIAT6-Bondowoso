/**
 * Cuti & Izin — Pengajuan → Review → Approval → History.
 * Approvals run through the server-side state machine (canTransition) and the
 * HR_LEAVE_APPROVE permission; approving also settles attendance + balance.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { CalendarPlus, Check, X } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/overlays";
import { useAuth } from "@/providers/AuthProvider";
import { formatDate, formatDateTime } from "@/lib/format";
import { LEAVE_TYPE, LEAVE_TYPE_LABELS } from "@/domain/leave";
import { calculateLeaveDays } from "@/domain/leave";
import type { Id } from "../../convex/_generated/dataModel";

interface LeaveRow {
  id: string;
  nomor: string;
  employeeId: string;
  namaLengkap: string;
  niy: string;
  bidang?: string;
  type: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: string;
  requestedAt: number;
  requestedByName: string;
  decidedAt?: number;
  decidedByName?: string;
  decisionNote?: string;
}

export default function LeavePage() {
  const { can } = useAuth();
  const canApprove = can("HR_LEAVE_APPROVE");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [decideTarget, setDecideTarget] = React.useState<{ row: LeaveRow; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    employeeId: "",
    type: LEAVE_TYPE.CUTI as string,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const requests = useQuery(api.leave.list, {
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : typeFilter,
  });
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const createMutation = useMutation(api.leave.create);
  const decideMutation = useMutation(api.leave.decide);

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
      await createMutation({
        employeeId: form.employeeId as Id<"employees">,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
      });
      toast.success("Pengajuan dibuat", { description: "Status: Menunggu Persetujuan." });
      setCreateOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDecide = async () => {
    if (!decideTarget) return;
    if (decideTarget.decision === "REJECTED" && !note.trim()) {
      toast.error("Alasan penolakan wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await decideMutation({ id: decideTarget.row.id as Id<"leaveRequests">, decision: decideTarget.decision, note: note.trim() || undefined });
      toast.success(
        decideTarget.decision === "APPROVED"
          ? "Pengajuan disetujui — kehadiran & saldo cuti ikut disesuaikan."
          : "Pengajuan ditolak.",
      );
      setDecideTarget(null);
      setNote("");
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const rows = (requests ?? []) as LeaveRow[];
  const pending = rows.filter((row) => row.status === "PENDING").length;
  const approved = rows.filter((row) => row.status === "APPROVED").length;
  const totalDays = rows.filter((row) => row.status === "APPROVED").reduce((sum, row) => sum + row.totalDays, 0);

  return (
    <>
      <PageHeader
        title="Cuti & Izin"
        description="Alur lengkap Pengajuan → Review → Approval → History. Keputusan dijalankan server-side dengan pemeriksaan status dan saldo."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Cuti & Izin" }]}
        actions={
          <Button
            onClick={() => {
              setForm((f) => ({ ...f, startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), reason: "" }));
              setCreateOpen(true);
            }}
          >
            <CalendarPlus /> Pengajuan Baru
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Menunggu Persetujuan" value={pending} tone="amber" icon={CalendarPlus} />
        <KpiCard label="Disetujui" value={approved} tone="emerald" icon={Check} />
        <KpiCard label="Total Hari Cuti" value={totalDays} icon={CalendarPlus} />
        <KpiCard label="Seluruh Pengajuan" value={rows.length} icon={CalendarPlus} tone="slate" />
      </div>

      <SectionCard
        title="Daftar pengajuan"
        description="Pengajuan terbaru di atas; setiap keputusan tercatat beserta aktor dan catatannya."
        actions={
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis</SelectItem>
                {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {requests === undefined ? (
          <LoadingState label="Memuat pengajuan…" />
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada pengajuan" description="Buat pengajuan cuti/izin pertama melalui tombol di atas." className="border-0" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Hari</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.nomor}</TableCell>
                    <TableCell>
                      <Link to={`/app/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                        {row.namaLengkap}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.bidang ?? "—"}</p>
                    </TableCell>
                    <TableCell>{LEAVE_TYPE_LABELS[row.type as keyof typeof LEAVE_TYPE_LABELS] ?? row.type}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(row.startDate)} – {formatDate(row.endDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.totalDays}</TableCell>
                    <TableCell><StatusBadge value={row.status} /></TableCell>
                    <TableCell className="text-right">
                      {canApprove && row.status === "PENDING" ? (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" className="size-8" onClick={() => { setDecideTarget({ row, decision: "APPROVED" }); setNote(""); }} aria-label="Setujui">
                            <Check className="size-4" />
                          </Button>
                          <Button size="icon" variant="destructive" className="size-8" onClick={() => { setDecideTarget({ row, decision: "REJECTED" }); setNote(""); }} aria-label="Tolak">
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {row.decidedByName ? `${row.decidedByName} · ${formatDateTime(row.decidedAt)}` : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Pengajuan cuti / izin</DialogTitle>
            <DialogDescription>
              Sistem menolak pengajuan yang beririsan dengan periode PENDING/APPROVED lain untuk karyawan yang sama.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Karyawan</Label>
              <Select value={form.employeeId} onValueChange={(value) => setForm((f) => ({ ...f, employeeId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan aktif" /></SelectTrigger>
                <SelectContent>
                  {(employees?.data ?? []).map((employee) => (
                    <SelectItem key={employee._id} value={employee._id}>
                      {employee.namaLengkap} — {employee.niy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <Select value={form.type} onValueChange={(value) => setForm((f) => ({ ...f, type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estimasi hari</Label>
              <Input readOnly value={`${calculateLeaveDays(form.startDate, form.endDate)} hari`} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal Mulai</Label>
              <Input type="date" value={form.startDate} onChange={(event) => setForm((f) => ({ ...f, startDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal Selesai</Label>
              <Input type="date" value={form.endDate} onChange={(event) => setForm((f) => ({ ...f, endDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Alasan</Label>
              <Textarea value={form.reason} onChange={(event) => setForm((f) => ({ ...f, reason: event.target.value }))} placeholder="Minimal 5 karakter…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Menyimpan…" : "Ajukan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decide dialog */}
      <Dialog open={!!decideTarget} onOpenChange={(open) => !open && setDecideTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decideTarget?.decision === "APPROVED" ? "Setujui pengajuan?" : "Tolak pengajuan?"}
            </DialogTitle>
            <DialogDescription>
              {decideTarget?.decision === "APPROVED" ? (
                <>
                  {decideTarget.row.nomor} — {decideTarget.row.namaLengkap}, {decideTarget.row.totalDays} hari. Persetujuan
                  otomatis menulis catatan kehadiran dan memotong saldo cuti.
                </>
              ) : (
                <>{decideTarget?.row.nomor} — {decideTarget?.row.namaLengkap}. Alasan penolakan wajib diisi.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {decideTarget?.decision === "REJECTED" && (
            <div className="space-y-1.5">
              <Label>Alasan penolakan</Label>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Card className="mr-auto flex items-center p-2 text-xs text-muted-foreground">{note && <>Catatan tercatat di riwayat.</>}</Card>
            <Button variant="outline" onClick={() => setDecideTarget(null)}>Batal</Button>
            <Button onClick={handleDecide} disabled={saving} variant={decideTarget?.decision === "APPROVED" ? "default" : "destructive"}>
              {decideTarget?.decision === "APPROVED" ? "Setujui" : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
