/**
 * Mutasi & Promosi — records position/unit changes with effective dates,
 * SK numbers and automatic employee master updates. History is never deleted.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeftRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { SectionCard } from "@/components/hris/Primitives";
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
import { formatDate } from "@/lib/format";
import { MUTATION_TYPE, MUTATION_TYPE_LABELS } from "@/domain/lifecycle";
import type { Id } from "../../convex/_generated/dataModel";

interface MutationRow {
  id: string;
  employeeId: string;
  namaLengkap: string;
  niy: string;
  bidang?: string;
  type: string;
  effectiveDate: string;
  fromPositionName?: string;
  toPositionName?: string;
  fromUnitName?: string;
  toUnitName?: string;
  skNumber?: string;
  notes?: string;
}

export default function MutationsPage() {
  const { can } = useAuth();
  const canEdit = can("HR_EDIT");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    employeeId: "",
    type: MUTATION_TYPE.MUTASI as string,
    effectiveDate: new Date().toISOString().slice(0, 10),
    toPositionId: "",
    toUnitId: "",
    skNumber: "",
    notes: "",
  });

  const mutations = useQuery(api.lifecycle.mutationList, { type: typeFilter === "all" ? undefined : typeFilter });
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });
  const units = useQuery(api.organization.listUnits, {});
  const positions = useQuery(api.organization.listPositions, {});

  const saveMutation = useMutation(api.lifecycle.mutationSave);

  const handleSave = async () => {
    if (!form.employeeId) {
      toast.error("Pilih karyawan terlebih dahulu.");
      return;
    }
    if (!form.toPositionId && !form.toUnitId) {
      toast.error("Tentukan jabatan atau unit tujuan.");
      return;
    }
    setSaving(true);
    try {
      await saveMutation({
        employeeId: form.employeeId as Id<"employees">,
        type: form.type,
        effectiveDate: form.effectiveDate,
        toPositionId: form.toPositionId ? (form.toPositionId as Id<"positions">) : null,
        toUnitId: form.toUnitId ? (form.toUnitId as Id<"organizationUnits">) : null,
        skNumber: form.skNumber || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Mutasi tercatat", { description: "Master karyawan diperbarui; jabatan/unit asal tersimpan di riwayat." });
      setOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const rows = (mutations ?? []) as MutationRow[];
  const thisYear = String(new Date().getFullYear());
  const thisYearCount = rows.filter((row) => row.effectiveDate.startsWith(thisYear)).length;
  const promosi = rows.filter((row) => row.type === MUTATION_TYPE.PROMOSI).length;

  return (
    <>
      <PageHeader
        title="Mutasi & Promosi"
        description="Riwayat perpindahan jabatan/unit: mutasi, promosi, demosi, rotasi dan kenaikan gaji — lengkap dengan SK."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Mutasi & Promosi" }]}
        actions={
          canEdit && (
            <Button
              onClick={() => {
                setForm((f) => ({ ...f, employeeId: "", toPositionId: "", toUnitId: "", skNumber: "", notes: "" }));
                setOpen(true);
              }}
            >
              <Plus /> Catat Mutasi
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Mutasi" value={rows.length} icon={ArrowLeftRight} />
        <KpiCard label={`Tahun ${thisYear}`} value={thisYearCount} icon={ArrowLeftRight} tone="sky" />
        <KpiCard label="Promosi" value={promosi} icon={ArrowLeftRight} tone="emerald" />
        <KpiCard label="Demosi" value={rows.filter((row) => row.type === MUTATION_TYPE.DEMOSI).length} icon={ArrowLeftRight} tone="amber" />
      </div>

      <SectionCard
        title="Riwayat mutasi"
        actions={
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua jenis</SelectItem>
              {Object.entries(MUTATION_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {mutations === undefined ? (
          <LoadingState label="Memuat mutasi…" />
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada mutasi" description="Catat perpindahan jabatan/unit pertama." className="border-0" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Efektif</TableHead>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Dari</TableHead>
                  <TableHead>Ke</TableHead>
                  <TableHead>SK</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(row.effectiveDate)}</TableCell>
                    <TableCell>
                      <Link to={`/app/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                        {row.namaLengkap}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.niy}</p>
                    </TableCell>
                    <TableCell>{MUTATION_TYPE_LABELS[row.type as keyof typeof MUTATION_TYPE_LABELS] ?? row.type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.fromPositionName ?? "—"}
                      {row.fromUnitName ? ` · ${row.fromUnitName}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.toPositionName ?? "—"}
                      {row.toUnitName ? ` · ${row.toUnitName}` : ""}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.skNumber ?? "—"}</TableCell>
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
            <DialogTitle>Catat mutasi / promosi</DialogTitle>
            <DialogDescription>
              Jabatan/unit asal diambil otomatis dari data karyawan saat ini. Untuk promosi/demosi cukup ubah jabatan
              tujuan; untuk mutasi antar-bidang pilih unit tujuan.
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
                  {Object.entries(MUTATION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal efektif</Label>
              <Input type="date" value={form.effectiveDate} onChange={(event) => setForm((f) => ({ ...f, effectiveDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jabatan tujuan</Label>
              <Select value={form.toPositionId || "__none"} onValueChange={(value) => setForm((f) => ({ ...f, toPositionId: value === "__none" ? "" : value }))}>
                <SelectTrigger><SelectValue placeholder="Tetap" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Tetap —</SelectItem>
                  {(positions ?? []).map((position) => (
                    <SelectItem key={position.id} value={position.id}>{position.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit tujuan</Label>
              <Select value={form.toUnitId || "__none"} onValueChange={(value) => setForm((f) => ({ ...f, toUnitId: value === "__none" ? "" : value }))}>
                <SelectTrigger><SelectValue placeholder="Tetap" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Tetap —</SelectItem>
                  {(units ?? []).map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nomor SK</Label>
              <Input value={form.skNumber} onChange={(event) => setForm((f) => ({ ...f, skNumber: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
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
