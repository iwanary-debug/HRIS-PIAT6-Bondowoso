/**
 * Disiplin & Pembinaan — sensitive records (HR_SENSITIVE_VIEW enforced on the
 * server): violation type, action ladder (catatan → SP3), coaching and
 * follow-up with full history.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Plus, ShieldAlert } from "lucide-react";
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
import { formatDate } from "@/lib/format";
import {
  DISCIPLINE_ACTION,
  DISCIPLINE_STATUS,
  DISCIPLINE_VIOLATION_TYPE,
} from "@/domain/development";
import type { Id } from "../../convex/_generated/dataModel";

const VIOLATION_LABELS: Record<string, string> = {
  TERLAMBAT: "Terlambat",
  TIDAK_HADIR: "Tidak Hadir",
  PEMALUAN: "Pelanggaran Pemaluannya",
  KECELAKAAAN: "Kecelakaan",
  KETIDAKDISIPLINAN: "Ketidakdisiplinan",
  PELANGGARAN_TATA_TERTIB: "Pelanggaran Tata Tertib",
  LAINNYA: "Lainnya",
};

const ACTION_LABELS: Record<string, string> = {
  CATATAN: "Catatan",
  PEMBINAAN: "Pembinaan",
  SP1: "SP 1",
  SP2: "SP 2",
  SP3: "SP 3",
  PENGGANTUNGAN: "Penggantungan",
  PEMUTUSAN: "Pemutusan",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Terbuka",
  IN_FOLLOW_UP: "Tindak Lanjut",
  RESOLVED: "Selesai",
};

interface DisciplineRow {
  id: string;
  employeeId: string;
  namaLengkap: string;
  niy: string;
  bidang?: string;
  incidentDate: string;
  violationType: string;
  description: string;
  action: string;
  status: string;
  followUpDate?: string;
  coachingNotes?: string;
}

export default function DisciplinePage() {
  const { can } = useAuth();
  const canEdit = can("HR_EDIT") && can("HR_SENSITIVE_VIEW");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    employeeId: "",
    incidentDate: new Date().toISOString().slice(0, 10),
    violationType: DISCIPLINE_VIOLATION_TYPE.TERLAMBAT as string,
    description: "",
    action: DISCIPLINE_ACTION.CATATAN as string,
    status: DISCIPLINE_STATUS.OPEN as string,
    followUpDate: "",
    coachingNotes: "",
  });

  const records = useQuery(api.lifecycle.disciplineList, { status: statusFilter === "all" ? undefined : statusFilter });
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const saveMutation = useMutation(api.lifecycle.disciplineSave);

  const handleSave = async () => {
    if (!form.employeeId) {
      toast.error("Pilih karyawan terlebih dahulu.");
      return;
    }
    if (form.description.trim().length < 10) {
      toast.error("Deskripsi minimal 10 karakter.");
      return;
    }
    setSaving(true);
    try {
      await saveMutation({
        employeeId: form.employeeId as Id<"employees">,
        incidentDate: form.incidentDate,
        violationType: form.violationType,
        description: form.description.trim(),
        action: form.action,
        status: form.status,
        followUpDate: form.followUpDate || null,
        coachingNotes: form.coachingNotes || undefined,
      });
      toast.success("Catatan disiplin tersimpan", { description: "Tercatat di audit log sebagai data sensitif." });
      setOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const rows = (records ?? []) as DisciplineRow[];
  const openCount = rows.filter((row) => row.status === "OPEN").length;
  const followUp = rows.filter((row) => row.status === "IN_FOLLOW_UP").length;

  return (
    <>
      <PageHeader
        title="Disiplin & Pembinaan"
        description="Catatan pelanggaran, tindakan pembinaan dan tindak lanjut. Halaman ini memerlukan izin HR_SENSITIVE_VIEW dan seluruh akses tercatat di audit log."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Disiplin & Pembinaan" }]}
        actions={
          canEdit && (
            <Button
              onClick={() => {
                setForm((f) => ({ ...f, employeeId: "", description: "", coachingNotes: "", followUpDate: "" }));
                setOpen(true);
              }}
            >
              <Plus /> Catatan Baru
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Catatan" value={rows.length} icon={ShieldAlert} />
        <KpiCard label="Terbuka" value={openCount} icon={ShieldAlert} tone="amber" />
        <KpiCard label="Dalam Tindak Lanjut" value={followUp} icon={ShieldAlert} tone="sky" />
        <KpiCard label="Selesai" value={rows.filter((row) => row.status === "RESOLVED").length} icon={ShieldAlert} tone="emerald" />
      </div>

      <SectionCard
        title="Riwayat pelanggaran & pembinaan"
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {records === undefined ? (
          <LoadingState label="Memuat catatan…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Tidak ada catatan disiplin"
            description="Pertahankan catatan kosong — tetap responsif bila suatu saat dibutuhkan."
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Pelanggaran</TableHead>
                  <TableHead>Tindakan</TableHead>
                  <TableHead>Tindak Lanjut</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(row.incidentDate)}</TableCell>
                    <TableCell>
                      <Link to={`/app/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                        {row.namaLengkap}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.niy} · {row.bidang ?? "—"}</p>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="font-medium">{VIOLATION_LABELS[row.violationType] ?? row.violationType}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.description}</p>
                    </TableCell>
                    <TableCell>{ACTION_LABELS[row.action] ?? row.action}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.followUpDate ? formatDate(row.followUpDate) : "—"}
                    </TableCell>
                    <TableCell><StatusBadge value={row.status} label={STATUS_LABELS[row.status] ?? row.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Card className="mt-4 border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
        <strong>Kerahasiaan:</strong> catatan disiplin tidak pernah dimasukkan ke ekspor umum, dan setiap pembacaan
        daftar ini dibatasi server-side (bukan sekadar disembunyikan di layar).
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Catatan disiplin baru</DialogTitle>
            <DialogDescription>
              Gunakan tangga tindakan bertahap: Catatan → Pembinaan → SP1 → SP2 → SP3.
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
              <Label>Tanggal kejadian</Label>
              <Input type="date" value={form.incidentDate} onChange={(event) => setForm((f) => ({ ...f, incidentDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis pelanggaran</Label>
              <Select value={form.violationType} onValueChange={(value) => setForm((f) => ({ ...f, violationType: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VIOLATION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Deskripsi kejadian</Label>
              <Textarea value={form.description} onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))} placeholder="Minimal 10 karakter…" />
            </div>
            <div className="space-y-1.5">
              <Label>Tindakan</Label>
              <Select value={form.action} onValueChange={(value) => setForm((f) => ({ ...f, action: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((f) => ({ ...f, status: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal tindak lanjut</Label>
              <Input type="date" value={form.followUpDate} onChange={(event) => setForm((f) => ({ ...f, followUpDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan pembinaan</Label>
              <Input value={form.coachingNotes} onChange={(event) => setForm((f) => ({ ...f, coachingNotes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
