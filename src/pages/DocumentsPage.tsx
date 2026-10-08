/**
 * Dokumen Karyawan — upload (storage abstraction), versioning, expiry dates,
 * status verification and audited preview/download. Files never live in Git.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Download, FileCheck2, FileText, FileWarning, Upload } from "lucide-react";
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
import { uploadFile, validateUpload } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { DOCUMENT_CATEGORY, DOCUMENT_CATEGORY_LABELS, DOCUMENT_STATUS } from "@/domain/lifecycle";
import type { Id } from "../../convex/_generated/dataModel";

interface DocumentRow {
  id: string;
  employeeId?: string;
  namaLengkap?: string;
  niy?: string;
  category: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  version: number;
  status: string;
  issuedDate?: string;
  expiryDate?: string;
  hasFile: boolean;
}

export default function DocumentsPage() {
  const { can } = useAuth();
  const canEdit = can("HR_DOCUMENT_EDIT");
  const [bidangId, setBidangId] = React.useState("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [form, setForm] = React.useState({
    employeeId: "",
    category: DOCUMENT_CATEGORY.KTP as string,
    name: "",
    issuedDate: "",
    expiryDate: "",
    notes: "",
  });

  const units = useQuery(api.organization.listUnits, {});
  const documents = useQuery(api.lifecycle.documentList, {
    bidangId: bidangId === "all" ? undefined : (bidangId as Id<"organizationUnits">),
    category: categoryFilter === "all" ? undefined : categoryFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const uploadDocumentMutation = useMutation(api.lifecycle.uploadDocument);
  const documentUrlMutation = useMutation(api.lifecycle.documentUrl);
  const setDocumentStatusMutation = useMutation(api.lifecycle.setDocumentStatus);

  const handleOpen = () => {
    setFile(null);
    setForm((f) => ({ ...f, name: "", issuedDate: "", expiryDate: "", notes: "" }));
    setOpen(true);
  };

  const handleUpload = async () => {
    if (!form.name.trim()) {
      toast.error("Nama dokumen wajib diisi.");
      return;
    }
    if (!file) {
      toast.error("Pilih berkas dokumen terlebih dahulu — setiap dokumen wajib memiliki file.");
      return;
    }
    setSaving(true);
    try {
      const problem = validateUpload(file);
      if (problem) throw new Error(problem);
      const uploaded = await uploadFile(file);
      const storageId = uploaded.storageId as Id<"_storage">;
      await uploadDocumentMutation({
        employeeId: form.employeeId ? (form.employeeId as Id<"employees">) : undefined,
        category: form.category,
        name: form.name.trim(),
        storageId,
        mimeType: file.type,
        sizeBytes: file.size,
        issuedDate: form.issuedDate || undefined,
        expiryDate: form.expiryDate || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Dokumen terunggah", { description: "Status awal PENDING — verifikasi melalui aksi status." });
      setOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (row: DocumentRow) => {
    try {
      const result = await documentUrlMutation({ id: row.id as Id<"documents"> });
      if (result.url) window.open(result.url, "_blank", "noopener");
      else toast.error("Dokumen ini tidak memiliki berkas tersimpan.");
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleSetStatus = async (row: DocumentRow, status: string) => {
    try {
      await setDocumentStatusMutation({ id: row.id as Id<"documents">, status });
      toast.success(`Status dokumen → ${status}`);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const rows = (documents ?? []) as DocumentRow[];
  const verified = rows.filter((row) => row.status === DOCUMENT_STATUS.VERIFIED).length;
  const pending = rows.filter((row) => row.status === DOCUMENT_STATUS.PENDING).length;
  const expiringSoon = rows.filter((row) => {
    if (!row.expiryDate) return false;
    const days = (new Date(`${row.expiryDate}T00:00:00`).getTime() - Date.now()) / 86_400_000;
    return days <= 90;
  }).length;

  return (
    <>
      <PageHeader
        title="Dokumen Karyawan"
        description="KTP, KK, ijazah, sertifikat, SK, kontrak — tersimpan pada storage terkelola (bukan di repositori), dengan versi, masa berlaku, dan audit pada setiap akses unduh."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Dokumen" }]}
        actions={
          canEdit && (
            <Button onClick={handleOpen}>
              <Upload /> Unggah Dokumen
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Dokumen" value={rows.length} icon={FileText} />
        <KpiCard label="Terverifikasi" value={verified} icon={FileCheck2} tone="emerald" />
        <KpiCard label="Menunggu Verifikasi" value={pending} icon={FileText} tone="amber" />
        <KpiCard label="Berakhir ≤90 hari" value={expiringSoon} icon={FileWarning} tone="red" />
      </div>

      <SectionCard
        title="Daftar dokumen"
        description="Unduhan selalu lewat URL singkat ber-audit — bukan tautan permanen yang bisa disebar."
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
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kategori</SelectItem>
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {Object.values(DOCUMENT_STATUS).map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {documents === undefined ? (
          <LoadingState label="Memuat dokumen…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada dokumen"
            description="Unggah dokumen pertama; versi bertambah otomatis bila kategori yang sama diunggah ulang."
            className="border-0"
          />
        ) : (
          <div className="max-h-[560px] overflow-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Versi</TableHead>
                  <TableHead>Berlaku s.d.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.employeeId ? (
                        <Link to={`/app/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                          {row.namaLengkap}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Umum</span>
                      )}
                      {row.niy && <p className="font-mono text-xs text-muted-foreground">{row.niy}</p>}
                    </TableCell>
                    <TableCell>{DOCUMENT_CATEGORY_LABELS[row.category as keyof typeof DOCUMENT_CATEGORY_LABELS] ?? row.category}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium">{row.name}</TableCell>
                    <TableCell className="tabular-nums">v{row.version}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.expiryDate)}</TableCell>
                    <TableCell><StatusBadge value={row.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {row.hasFile && (
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => void handleDownload(row)} aria-label="Unduh">
                            <Download className="size-4" />
                          </Button>
                        )}
                        {canEdit && row.status === DOCUMENT_STATUS.PENDING && (
                          <Button variant="outlineNavy" size="sm" onClick={() => void handleSetStatus(row, DOCUMENT_STATUS.VERIFIED)}>
                            Verifikasi
                          </Button>
                        )}
                        {canEdit && row.status === DOCUMENT_STATUS.VERIFIED && (
                          <Button variant="ghost" size="sm" onClick={() => void handleSetStatus(row, DOCUMENT_STATUS.PENDING)}>
                            Batal verifikasi
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* Upload dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Unggah dokumen</DialogTitle>
            <DialogDescription>
              PDF/gambar/Office maksimal 15 MB. Untuk kategori yang sama pada karyawan yang sama, versi otomatis
              bertambah. Berkas disimpan pada storage backend — tidak pernah masuk repositori kode.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Karyawan (opsional)</Label>
              <Select value={form.employeeId || "__none"} onValueChange={(value) => setForm((f) => ({ ...f, employeeId: value === "__none" ? "" : value }))}>
                <SelectTrigger><SelectValue placeholder="Dokumen umum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Dokumen umum —</SelectItem>
                  {(employees?.data ?? []).map((employee) => (
                    <SelectItem key={employee._id} value={employee._id}>{employee.namaLengkap} — {employee.niy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={form.category} onValueChange={(value) => setForm((f) => ({ ...f, category: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nama dokumen</Label>
              <Input value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal terbit</Label>
              <Input type="date" value={form.issuedDate} onChange={(event) => setForm((f) => ({ ...f, issuedDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Berlaku sampai</Label>
              <Input type="date" value={form.expiryDate} onChange={(event) => setForm((f) => ({ ...f, expiryDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Berkas</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx,.xls,.xlsx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleUpload} disabled={saving}>{saving ? "Mengunggah…" : "Unggah"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
