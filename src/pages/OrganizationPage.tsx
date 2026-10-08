/**
 * Struktur Organisasi — unit/bidang tree, org chart of positions with holders
 * (rooted at Mudir via reporting lines), plus assignment of employees.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Building2, GitBranch, Network, Plus, UserPlus } from "lucide-react";
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
} from "@/components/ui/overlays";
import { useAuth } from "@/providers/AuthProvider";
import type { Id } from "../../convex/_generated/dataModel";

interface OrgNode {
  position?: {
    _id: string;
    nama: string;
    level: string;
    isStructural?: boolean;
  };
  holder?: { _id: string; namaLengkap: string; niy: string };
  children: OrgNode[];
}

function NodeTree({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  return (
    <div className={depth > 0 ? "ml-4 border-l border-border/70 pl-4" : ""}>
      <Card className={`mb-2 flex items-center justify-between gap-3 p-3 ${node.position?.isStructural ? "border-navy-200 bg-navy-50/50" : ""}`}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {node.position?.nama ?? "—"}
            {node.position?.isStructural && (
              <span className="ml-2 rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-semibold text-navy-800">STRUKTURAL</span>
            )}
          </p>
          {node.holder ? (
            <Link to={`/app/employees/${node.holder._id}`} className="text-xs text-primary hover:underline">
              {node.holder.namaLengkap} · {node.holder.niy}
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">Vakant</p>
          )}
        </div>
      </Card>
      {node.children.map((child, index) => (
        <NodeTree key={`${child.position?._id ?? index}-${depth}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function OrganizationPage() {
  const { can } = useAuth();
  const canEdit = can("HR_EDIT");
  const [unitOpen, setUnitOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [unitForm, setUnitForm] = React.useState({ kode: "", nama: "", keterangan: "" });
  const [assignForm, setAssignForm] = React.useState({
    employeeId: "",
    positionId: "",
    unitId: "",
    mulai: new Date().toISOString().slice(0, 10),
    alasan: "",
  });

  const chart = useQuery(api.organization.orgChart, {});
  const units = useQuery(api.organization.listUnits, {});
  const positions = useQuery(api.organization.listPositions, {});
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const saveUnitMutation = useMutation(api.organization.saveUnit);
  const assignPositionMutation = useMutation(api.organization.assignPosition);

  const handleSaveUnit = async () => {
    if (!unitForm.nama.trim()) {
      toast.error("Nama unit wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await saveUnitMutation({ kode: unitForm.kode, nama: unitForm.nama, keterangan: unitForm.keterangan || undefined });
      toast.success("Unit tersimpan");
      setUnitOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!assignForm.employeeId || !assignForm.positionId || !assignForm.unitId) {
      toast.error("Lengkapi karyawan, jabatan, dan unit.");
      return;
    }
    setSaving(true);
    try {
      await assignPositionMutation({
        employeeId: assignForm.employeeId as Id<"employees">,
        positionId: assignForm.positionId as Id<"positions">,
        unitId: assignForm.unitId as Id<"organizationUnits">,
        mulai: assignForm.mulai,
        alasan: assignForm.alasan || undefined,
      });
      toast.success("Penempatan tersimpan", { description: "Penempatan lama ditutup; histori tetap tersimpan." });
      setAssignOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const filled = (positions ?? []).filter((position) => position.holder).length;

  return (
    <>
      <PageHeader
        title="Struktur Organisasi"
        description="Lima bidang PIAT 6 (Mudir, Madrasah, Kepengasuhan, Keuangan SDM, Rumah Tangga) beserta jabatan, atasan, bawahan, dan posisi aktif."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Struktur Organisasi" }]}
        actions={
          canEdit && (
            <>
              <Button variant="outlineNavy" onClick={() => setAssignOpen(true)}>
                <UserPlus /> Penempatan
              </Button>
              <Button onClick={() => setUnitOpen(true)}>
                <Plus /> Unit Baru
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Unit/Bidang" value={chart?.totalUnits ?? 0} icon={Building2} />
        <KpiCard label="Jabatan" value={chart?.totalPositions ?? 0} icon={Network} tone="sky" />
        <KpiCard label="Posisi Terisi" value={filled} icon={UserPlus} tone="emerald" />
        <KpiCard label="Vakant" value={(chart?.totalPositions ?? 0) - filled} icon={Network} tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title="Bagan organisasi"
          description="Pohon jabatan berdasarkan garis pelaporan; lembaga tanpa induk tampil di bagian bawah."
        >
          {chart === undefined ? (
            <LoadingState label="Menyusun bagan…" />
          ) : (
            <div className="max-h-[620px] overflow-auto scrollbar-thin pr-1">
              {chart.rootUnits.map((root) => (
                <div key={root.unit._id} className="mb-5">
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-white">
                    <Building2 className="size-4" />
                    <span className="text-sm font-semibold">{root.unit.nama}</span>
                    <span className="ml-auto text-[11px] text-white/60">
                      {(units ?? []).find((unit) => unit.id === root.unit._id)?.jumlahKaryawan ?? 0} karyawan
                    </span>
                  </div>
                  {root.children.length === 0 ? (
                    <p className="ml-4 text-xs text-muted-foreground">Belum ada jabatan pada unit ini.</p>
                  ) : (
                    root.children.map((node, index) => (
                      <NodeTree key={`${node.position?._id ?? "root"}-${index}`} node={node} />
                    ))
                  )}
                </div>
              ))}
              {chart.orphans.length > 0 && (
                <div className="mb-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Jabatan di luar unit root
                  </p>
                  {chart.orphans.map((node, index) => (
                    <NodeTree key={`orphan-${index}`} node={node} />
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Unit & jumlah karyawan" description="Ringkasan bidang berdasarkan penempatan aktif.">
          {units === undefined ? (
            <LoadingState label="Memuat unit…" />
          ) : units.length === 0 ? (
            <EmptyState title="Belum ada unit" description="Jalankan seed dari Pengaturan atau tambah unit manual." className="border-0" />
          ) : (
            <div className="space-y-2">
              {units.map((unit) => (
                <Card key={unit.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-semibold text-foreground">{unit.nama}</p>
                    <p className="text-xs text-muted-foreground">
                      {unit.jumlahPosisi} jabatan aktif {unit.keterangan ? `· ${unit.keterangan}` : ""}
                    </p>
                  </div>
                  <StatusBadge value="APPROVED" label={`${unit.jumlahKaryawan} karyawan`} />
                </Card>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Card className="mt-4 flex items-start gap-2 p-4 text-xs text-muted-foreground">
        <GitBranch className="mt-0.5 size-4 shrink-0" />
        Struktur jabatan & garis pelaporan diambil dari referensi master data karyawan (Mudir → Kabid/Kamad → staf).
        Perubahan penempatan lewat tombol Penempatan otomatis menutup penempatan lama tanpa menghapus riwayat.
      </Card>

      {/* Unit dialog */}
      <Dialog open={unitOpen} onOpenChange={setUnitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unit / bidang baru</DialogTitle>
            <DialogDescription>Kode otomatis dibuat dari nama bila dikosongkan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama unit</Label>
              <Input value={unitForm.nama} onChange={(event) => setUnitForm((f) => ({ ...f, nama: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Kode (opsional)</Label>
              <Input value={unitForm.kode} onChange={(event) => setUnitForm((f) => ({ ...f, kode: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Input value={unitForm.keterangan} onChange={(event) => setUnitForm((f) => ({ ...f, keterangan: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitOpen(false)}>Batal</Button>
            <Button onClick={handleSaveUnit} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Penempatan karyawan</DialogTitle>
            <DialogDescription>
              Menetapkan jabatan + unit sekaligus; penempatan utama sebelumnya ditandai selesai (histori tetap ada).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Karyawan</Label>
              <Select value={assignForm.employeeId} onValueChange={(value) => setAssignForm((f) => ({ ...f, employeeId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan aktif" /></SelectTrigger>
                <SelectContent>
                  {(employees?.data ?? []).map((employee) => (
                    <SelectItem key={employee._id} value={employee._id}>{employee.namaLengkap} — {employee.niy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Jabatan</Label>
              <Select value={assignForm.positionId} onValueChange={(value) => setAssignForm((f) => ({ ...f, positionId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih jabatan" /></SelectTrigger>
                <SelectContent>
                  {(positions ?? []).map((position) => (
                    <SelectItem key={position.id} value={position.id}>
                      {position.nama} {position.unitName ? `· ${position.unitName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={assignForm.unitId} onValueChange={(value) => setAssignForm((f) => ({ ...f, unitId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih unit" /></SelectTrigger>
                <SelectContent>
                  {(units ?? []).map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mulai efektif</Label>
              <Input type="date" value={assignForm.mulai} onChange={(event) => setAssignForm((f) => ({ ...f, mulai: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Alasan</Label>
              <Input value={assignForm.alasan} onChange={(event) => setAssignForm((f) => ({ ...f, alasan: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Batal</Button>
            <Button onClick={handleAssign} disabled={saving}>Simpan Penempatan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
