/**
 * Kontrak & Kepegawaian — contract list, "Kontrak Akan Berakhir" board with
 * the four spec indicators (aman / mendekati / perlu tindakan / lewat),
 * create/edit and renewal.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Plus, RefreshCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { Pagination, SectionCard, StatusBadge } from "@/components/hris/Primitives";
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
import { CONTRACT_TYPE } from "@/domain/contract";
import type { Id } from "../../convex/_generated/dataModel";

interface BoardRow {
  contractId: string;
  employeeId: string;
  namaLengkap: string;
  niy: string;
  bidang?: string;
  jabatan?: string;
  nomor: string;
  type: string;
  selesai?: string;
  status: string;
  daysRemaining: number | null;
}

interface ContractRow {
  id: string;
  nomor: string;
  type: string;
  mulai: string;
  selesai?: string;
  durasi?: string;
  status: string;
  employee: { id: string; namaLengkap: string; niy: string; jabatan?: string } | null;
  contractStatus: string;
  daysRemaining: number | null;
}

export default function ContractsPage() {
  const { can } = useAuth();
  const [statusFilter, setStatusFilter] = React.useState("AKTIF");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [renewTarget, setRenewTarget] = React.useState<BoardRow | null>(null);
  const [form, setForm] = React.useState<{
    employeeId: string;
    type: string;
    mulai: string;
    selesai: string;
    durasi: string;
    nomor: string;
    notes: string;
  }>({
    employeeId: "",
    type: CONTRACT_TYPE.PKWT,
    mulai: new Date().toISOString().slice(0, 10),
    selesai: "",
    durasi: "1 Tahun",
    nomor: "",
    notes: "",
  });
  const [saving, setSaving] = React.useState(false);

  const contracts = useQuery(api.contracts.list, {
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : typeFilter,
  });
  const board = useQuery(api.contracts.expiringBoard, {});
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const saveMutation = useMutation(api.contracts.save);
  const renewMutation = useMutation(api.contracts.renew);

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
        mulai: form.mulai,
        selesai: form.type === CONTRACT_TYPE.PKWTT ? null : form.selesai || null,
        durasi: form.durasi || undefined,
        nomor: form.nomor || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Kontrak disimpan", { description: "Kontrak aktif sebelumnya otomatis ditutup." });
      setDialogOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRenew = async () => {
    if (!renewTarget) return;
    setSaving(true);
    try {
      await renewMutation({ contractId: renewTarget.contractId as Id<"contracts"> });
      toast.success("Kontrak diperpanjang", { description: "Periode baru dibuat dengan durasi yang sama." });
      setRenewTarget(null);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const counts = board?.counts ?? { AMAN: 0, MENDEKAT: 0, PERLU_TINDAKAN: 0, LEWAT: 0 };

  return (
    <>
      <PageHeader
        title="Kontrak & Kepegawaian"
        description="PKWT/PKWTT, jatuh tempo kontrak, perpanjangan, dan riwayat lengkap. Papan indikator mengikuti batas aman bawaan: mendekati ≤90 hari, perlu tindakan ≤30 hari."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Kontrak & SK" }]}
        actions={
          can("HR_CONTRACT_EDIT") ? (
            <Button
              onClick={() => {
                setForm({
                  employeeId: "",
                  type: CONTRACT_TYPE.PKWT,
                  mulai: new Date().toISOString().slice(0, 10),
                  selesai: "",
                  durasi: "1 Tahun",
                  nomor: "",
                  notes: "",
                });
                setDialogOpen(true);
              }}
            >
              <Plus /> Kontrak Baru
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Aman" value={counts.AMAN} icon={ShieldCheck} tone="emerald" />
        <KpiCard label="Mendekati Jatuh Tempo" value={counts.MENDEKAT} icon={CalendarClock} tone="sky" hint="≤ 90 hari" />
        <KpiCard label="Perlu Tindakan" value={counts.PERLU_TINDAKAN} icon={CalendarClock} tone="amber" hint="≤ 30 hari" />
        <KpiCard label="Sudah Lewat" value={counts.LEWAT} icon={CalendarClock} tone="red" />
      </div>

      <SectionCard
        className="mb-4"
        title="Kontrak akan berakhir"
        description="Daftar kontrak aktif yang perlu diperhatikan, diurutkan dari sisa hari terkecil."
      >
        {board === undefined ? (
          <LoadingState label="Memuat papan kontrak…" />
        ) : board.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada kontrak yang mendekati jatuh tempo. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Kontrak</TableHead>
                  <TableHead>Berakhir</TableHead>
                  <TableHead>Sisa</TableHead>
                  <TableHead>Indikator</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.rows.map((row) => (
                  <TableRow key={row.contractId}>
                    <TableCell>
                      <Link to={`/app/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                        {row.namaLengkap}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {row.niy} · {row.jabatan ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.nomor}</TableCell>
                    <TableCell>{formatDate(row.selesai)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.daysRemaining !== null ? `${row.daysRemaining} hari` : "—"}
                    </TableCell>
                    <TableCell><StatusBadge value={row.status} /></TableCell>
                    <TableCell className="text-right">
                      {can("HR_CONTRACT_EDIT") && (
                        <Button variant="outlineNavy" size="sm" onClick={() => setRenewTarget(row)}>
                          <RefreshCcw /> Perpanjang
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Daftar kontrak"
        description="Semua kontrak pada sistem dengan filter status dan jenis."
        actions={
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {["AKTIF", "SELESAI", "DIBATALKAN"].map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis</SelectItem>
                <SelectItem value={CONTRACT_TYPE.PKWT}>PKWT</SelectItem>
                <SelectItem value={CONTRACT_TYPE.PKWTT}>PKWTT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {contracts === undefined ? (
          <LoadingState label="Memuat daftar kontrak…" />
        ) : contracts.length === 0 ? (
          <EmptyState
            title="Belum ada kontrak"
            description="Buat kontrak pertama untuk mulai melacak jatuh tempo PKWT/PKWTT."
            className="border-0"
          />
        ) : (
          <PaginationlessList rows={contracts as ContractRow[]} />
        )}
      </SectionCard>

      {/* Create contract dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Kontrak baru</DialogTitle>
            <DialogDescription>
              Kontrak aktif sebelumnya milik karyawan yang sama otomatis ditandai SELESAI — riwayat tetap tersimpan.
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
              <Label>Jenis Kontrak</Label>
              <Select value={form.type} onValueChange={(value) => setForm((f) => ({ ...f, type: value as string }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CONTRACT_TYPE.PKWT}>PKWT (waktu tertentu)</SelectItem>
                  <SelectItem value={CONTRACT_TYPE.PKWTT}>PKWTT (waktu tidak tertentu)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal Mulai</Label>
              <Input type="date" value={form.mulai} onChange={(event) => setForm((f) => ({ ...f, mulai: event.target.value }))} />
            </div>
            {form.type === CONTRACT_TYPE.PKWT && (
              <>
                <div className="space-y-1.5">
                  <Label>Durasi</Label>
                  <Input value={form.durasi} placeholder="cth. 1 Tahun" onChange={(event) => setForm((f) => ({ ...f, durasi: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tanggal Berakhir</Label>
                  <Input type="date" value={form.selesai} onChange={(event) => setForm((f) => ({ ...f, selesai: event.target.value }))} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Nomor SK (opsional)</Label>
              <Input value={form.nomor} placeholder="Kosongkan untuk nomor otomatis" onChange={(event) => setForm((f) => ({ ...f, nomor: event.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Catatan</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan…" : "Simpan Kontrak"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew confirm */}
      <Dialog open={!!renewTarget} onOpenChange={(open) => !open && setRenewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Perpanjang kontrak {renewTarget?.nomor}?</DialogTitle>
            <DialogDescription>
              Kontrak saat ini ditutup dan periode baru dibuat dengan durasi yang sama, dimulai sehari setelah
              tanggal berakhir. Riwayat kontrak lengkap tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewTarget(null)}>Batal</Button>
            <Button onClick={handleRenew} disabled={saving}>Ya, perpanjang</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mt-4 p-4 text-xs text-muted-foreground">
        Setiap pembuatan dan perpanjangan kontrak tercatat di audit log, termasuk perubahan status akad dan jatuh
        tempo pada master karyawan.
      </Card>
    </>
  );
}

function PaginationlessList({ rows }: { rows: ContractRow[] }) {
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Nomor</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Mulai</TableHead>
              <TableHead>Berakhir</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Indikator</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.employee ? (
                    <Link to={`/app/employees/${row.employee.id}`} className="font-medium hover:text-primary">
                      {row.employee.namaLengkap}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.nomor}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>{formatDate(row.mulai)}</TableCell>
                <TableCell>{row.selesai ? formatDate(row.selesai) : "PKWTT"}</TableCell>
                <TableCell><StatusBadge value={row.status} /></TableCell>
                <TableCell>
                  <StatusBadge value={row.contractStatus} label={`${row.contractStatus}${row.daysRemaining !== null ? ` · ${row.daysRemaining}h` : ""}`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={rows.length}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </>
  );
}
