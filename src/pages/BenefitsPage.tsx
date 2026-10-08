/**
 * BPJS & Benefit — membership numbers are masked server-side without
 * HR_SENSITIVE_VIEW; this page only renders what the backend already filtered.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { HeartPulse, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, LoadingState, describeError } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/overlays";
import { useAuth } from "@/providers/AuthProvider";
import { formatCurrency, formatDate } from "@/lib/format";
import { BENEFIT_TYPE, BENEFIT_STATUS } from "@/domain/lifecycle";
import type { Id } from "../../convex/_generated/dataModel";

const BENEFIT_TYPE_LABELS: Record<string, string> = {
  BPJS_KESEHATAN: "BPJS Kesehatan",
  BPJS_KETENAGAKERJAAN: "BPJS Ketenagakerjaan",
  TUNJANGAN: "Tunjangan",
  ASURANSI: "Asuransi",
  LAINNYA: "Lainnya",
};

const BENEFIT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "AKTIF",
  INACTIVE: "TIDAK_AKTIF",
  PENDING: "PENDING",
};

export default function BenefitsPage() {
  const { can } = useAuth();
  const canEdit = can("HR_EDIT");
  const [bidangId, setBidangId] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    employeeId: "",
    type: BENEFIT_TYPE.BPJS_KESEHATAN as string,
    provider: "",
    number: "",
    status: BENEFIT_STATUS.ACTIVE as string,
    startDate: new Date().toISOString().slice(0, 10),
    monthlyContribution: 0,
    notes: "",
  });

  const units = useQuery(api.organization.listUnits, {});
  const benefits = useQuery(api.benefits.list, {
    bidangId: bidangId === "all" ? undefined : (bidangId as Id<"organizationUnits">),
    type: typeFilter === "all" ? undefined : typeFilter,
  });
  const summary = useQuery(api.benefits.summary, {});
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const saveMutation = useMutation(api.benefits.save);

  const handleSave = async () => {
    if (!form.employeeId) {
      toast.error("Pilih karyawan terlebih dahulu.");
      return;
    }
    setSaving(true);
    try {
      await saveMutation({
        employeeId: form.employeeId as Id<"employees">,
        type: form.type,
        provider: form.provider || undefined,
        number: form.number || undefined,
        status: form.status,
        startDate: form.startDate || undefined,
        monthlyContribution: form.monthlyContribution || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Benefit tersimpan", { description: "Nomor kepesertaan disamarkan untuk pengguna tanpa izin." });
      setOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="BPJS & Benefit"
        description="Kepesertaan BPJS Kesehatan/Ketenagakerjaan, asuransi dan tunjangan. Nomor kepesertaan dan kontribusi hanya tampil penuh bagi pemegang izin data sensitif."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "BPJS & Benefit" }]}
        actions={
          canEdit && (
            <Button
              onClick={() => {
                setForm((f) => ({ ...f, employeeId: "", number: "", notes: "" }));
                setOpen(true);
              }}
            >
              <Plus /> Pendaftaran Baru
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Karyawan Aktif" value={summary?.totalActive ?? 0} icon={HeartPulse} />
        <KpiCard label="BPJS Kesehatan" value={summary?.bpjsKesehatan ?? 0} icon={ShieldCheck} tone="sky" />
        <KpiCard label="BPJS Ketenagakerjaan" value={summary?.bpjsKetenagakerjaan ?? 0} icon={ShieldCheck} tone="emerald" />
        <KpiCard label="Tunjangan/Asuransi" value={summary?.lainnya ?? 0} icon={HeartPulse} tone="slate" />
      </div>

      <SectionCard
        title="Daftar kepesertaan"
        description="Nomor yang disamarkan (••••) berarti akun Anda tidak memegang HR_SENSITIVE_VIEW untuk kolom tersebut."
        actions={
          <div className="flex gap-2">
            <Select value={bidangId} onValueChange={setBidangId}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua bidang</SelectItem>
                {(units ?? []).map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>{unit.nama}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis</SelectItem>
                {Object.entries(BENEFIT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {benefits === undefined ? (
          <LoadingState label="Memuat benefit…" />
        ) : benefits.length === 0 ? (
          <EmptyState
            title="Belum ada pendaftaran benefit"
            description="Catat kepesertaan BPJS karyawan melalui Pendaftaran Baru, atau biarkan diisi saat import data sensitif."
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Penyedia</TableHead>
                  <TableHead>No. Kepesertaan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sejak</TableHead>
                  <TableHead className="text-right">Iuran/Bulan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benefits.map((benefit) => (
                  <TableRow key={benefit.id}>
                    <TableCell>
                      <Link to={`/app/employees/${benefit.employeeId}`} className="font-medium hover:text-primary">
                        {benefit.namaLengkap}
                      </Link>
                      <p className="text-xs text-muted-foreground">{benefit.niy} · {benefit.bidang ?? "—"}</p>
                    </TableCell>
                    <TableCell>{BENEFIT_TYPE_LABELS[benefit.type] ?? benefit.type}</TableCell>
                    <TableCell>{benefit.provider ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{benefit.number ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge
                        value={BENEFIT_STATUS_LABELS[benefit.status] ?? benefit.status}
                        label={benefit.status}
                      />
                    </TableCell>
                    <TableCell>{formatDate(benefit.startDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {benefit.monthlyContribution ? formatCurrency(benefit.monthlyContribution) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Pendaftaran BPJS / Benefit</DialogTitle>
            <DialogDescription>
              Gunakan nomor fiktif untuk data latih — nomor asli hanya boleh masuk melalui import HRD di lingkungan produksi.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Karyawan</Label>
              <Select value={form.employeeId} onValueChange={(value) => setForm((f) => ({ ...f, employeeId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan" /></SelectTrigger>
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
                  {Object.entries(BENEFIT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Penyedia</Label>
              <Input value={form.provider} onChange={(event) => setForm((f) => ({ ...f, provider: event.target.value }))} placeholder="BPJS / Asuransi X" />
            </div>
            <div className="space-y-1.5">
              <Label>No. Kepesertaan</Label>
              <Input value={form.number} onChange={(event) => setForm((f) => ({ ...f, number: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((f) => ({ ...f, status: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={BENEFIT_STATUS.ACTIVE}>Aktif</SelectItem>
                  <SelectItem value={BENEFIT_STATUS.PENDING}>Pending</SelectItem>
                  <SelectItem value={BENEFIT_STATUS.INACTIVE}>Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal mulai</Label>
              <Input type="date" value={form.startDate} onChange={(event) => setForm((f) => ({ ...f, startDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Iuran/bulan (Rp)</Label>
              <Input type="number" value={form.monthlyContribution} onChange={(event) => setForm((f) => ({ ...f, monthlyContribution: Number(event.target.value) }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} />
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
