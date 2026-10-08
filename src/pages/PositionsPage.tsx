/**
 * Jabatan & Unit — admin untuk master jabatan (level, struktural, atasan)
 * dan unit. Terhubung ke bagan organisasi dan penempatan karyawan.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Briefcase, Building2, Plus } from "lucide-react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/overlays";
import { useAuth } from "@/providers/AuthProvider";
import { POSITION_LEVEL, POSITION_LEVEL_LABELS } from "@/domain/organization";
import type { Id } from "../../convex/_generated/dataModel";

interface PositionRow {
  id: string;
  kode: string;
  nama: string;
  level: string;
  isStructural: boolean;
  unitId?: string;
  unitName?: string;
  reportsToPositionId?: string;
  active: boolean;
  holder: { id: string; namaLengkap: string; niy: string } | null;
}

interface UnitRow {
  id: string;
  kode: string;
  nama: string;
  type: string;
  jumlahKaryawan: number;
  jumlahPosisi: number;
  keterangan?: string;
}

export default function PositionsPage() {
  const { can } = useAuth();
  const canEdit = can("HR_EDIT");
  const [unitFilter, setUnitFilter] = React.useState("all");
  const [positionOpen, setPositionOpen] = React.useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [positionForm, setPositionForm] = React.useState({
    kode: "",
    nama: "",
    level: POSITION_LEVEL.PELAKSANA as string,
    unitId: "",
    reportsToPositionId: "",
    isStructural: false,
    keterangan: "",
  });
  const [unitForm, setUnitForm] = React.useState({ kode: "", nama: "", type: "BIDANG", keterangan: "" });

  const units = useQuery(api.organization.listUnits, {});
  const positions = useQuery(api.organization.listPositions, {
    unitId: unitFilter === "all" ? undefined : (unitFilter as Id<"organizationUnits">),
  });

  const savePositionMutation = useMutation(api.organization.savePosition);
  const saveUnitMutation = useMutation(api.organization.saveUnit);

  const handleSavePosition = async () => {
    if (!positionForm.nama.trim()) {
      toast.error("Nama jabatan wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await savePositionMutation({
        kode: positionForm.kode,
        nama: positionForm.nama,
        level: positionForm.level,
        unitId: positionForm.unitId ? (positionForm.unitId as Id<"organizationUnits">) : null,
        reportsToPositionId: positionForm.reportsToPositionId ? (positionForm.reportsToPositionId as Id<"positions">) : null,
        isStructural: positionForm.isStructural,
        keterangan: positionForm.keterangan || undefined,
      });
      toast.success("Jabatan tersimpan");
      setPositionOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUnit = async () => {
    if (!unitForm.nama.trim()) {
      toast.error("Nama unit wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await saveUnitMutation({
        kode: unitForm.kode,
        nama: unitForm.nama,
        type: unitForm.type,
        keterangan: unitForm.keterangan || undefined,
      });
      toast.success("Unit tersimpan");
      setUnitDialogOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const structural = (positions ?? []).filter((position) => position.isStructural).length;

  return (
    <>
      <PageHeader
        title="Jabatan & Unit"
        description="Master jabatan (level struktural/pelaksana, atasan langsung) dan unit kerja — dasar bagi bagan organisasi, penempatan, dan filter seluruh modul."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Jabatan & Unit" }]}
        actions={
          canEdit && (
            <>
              <Button variant="outlineNavy" onClick={() => setUnitDialogOpen(true)}>
                <Building2 /> Unit Baru
              </Button>
              <Button
                onClick={() => {
                  setPositionForm((f) => ({ ...f, kode: "", nama: "", keterangan: "", reportsToPositionId: "" }));
                  setPositionOpen(true);
                }}
              >
                <Plus /> Jabatan Baru
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Jabatan" value={positions?.length ?? 0} icon={Briefcase} />
        <KpiCard label="Struktural" value={structural} icon={Briefcase} tone="sky" />
        <KpiCard label="Unit/Bidang" value={units?.length ?? 0} icon={Building2} tone="emerald" />
        <KpiCard label="Vakant" value={(positions ?? []).filter((p) => !p.holder).length} icon={Briefcase} tone="amber" />
      </div>

      <Tabs defaultValue="jabatan">
        <TabsList>
          <TabsTrigger value="jabatan"><Briefcase /> Jabatan</TabsTrigger>
          <TabsTrigger value="unit"><Building2 /> Unit</TabsTrigger>
        </TabsList>

        <TabsContent value="jabatan">
          <SectionCard
            title="Daftar jabatan"
            description="Atasan langsung menentukan bentuk bagan organisasi."
            actions={
              <Select value={unitFilter} onValueChange={setUnitFilter}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua unit</SelectItem>
                  {(units ?? []).map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          >
            {positions === undefined ? (
              <LoadingState label="Memuat jabatan…" />
            ) : positions.length === 0 ? (
              <EmptyState title="Belum ada jabatan" description="Tambahkan jabatan atau jalankan seed referensi." className="border-0" />
            ) : (
              <div className="max-h-[560px] overflow-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jabatan</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Atasan</TableHead>
                      <TableHead>Pemegang</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(positions as PositionRow[]).map((position) => {
                      const supervisor = (positions as PositionRow[]).find((p) => p.id === position.reportsToPositionId);
                      return (
                        <TableRow key={position.id}>
                          <TableCell>
                            <p className="font-medium">{position.nama}</p>
                            <p className="font-mono text-xs text-muted-foreground">{position.kode}</p>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              value={position.isStructural ? "IN_CLEARANCE" : "DRAFT"}
                              label={position.level}
                            />
                          </TableCell>
                          <TableCell>{position.unitName ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{supervisor?.nama ?? "—"}</TableCell>
                          <TableCell>
                            {position.holder ? (
                              <Link to={`/app/employees/${position.holder.id}`} className="text-sm font-medium text-primary hover:underline">
                                {position.holder.namaLengkap}
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">Vakant</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge value={position.active ? "AKTIF" : "TIDAK_AKTIF"} label={position.active ? "Aktif" : "Nonaktif"} />
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

        <TabsContent value="unit">
          <SectionCard title="Daftar unit / bidang">
            {units === undefined ? (
              <LoadingState label="Memuat unit…" />
            ) : units.length === 0 ? (
              <EmptyState title="Belum ada unit" className="border-0" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-right">Jabatan</TableHead>
                      <TableHead className="text-right">Karyawan Aktif</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(units as UnitRow[]).map((unit) => (
                      <TableRow key={unit.id}>
                        <TableCell className="font-mono text-xs">{unit.kode}</TableCell>
                        <TableCell className="font-medium">{unit.nama}</TableCell>
                        <TableCell>{unit.type}</TableCell>
                        <TableCell className="text-right tabular-nums">{unit.jumlahPosisi}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{unit.jumlahKaryawan}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{unit.keterangan ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Position dialog */}
      <Dialog open={positionOpen} onOpenChange={setPositionOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Jabatan baru</DialogTitle>
            <DialogDescription>
              Nama disimpan dalam huruf kapital sesuai referensi. Atasan langsung membentuk hierarki bagan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nama jabatan</Label>
              <Input value={positionForm.nama} onChange={(event) => setPositionForm((f) => ({ ...f, nama: event.target.value }))} placeholder="cth. WAKA KURIKULUM IM" />
            </div>
            <div className="space-y-1.5">
              <Label>Kode (opsional)</Label>
              <Input value={positionForm.kode} onChange={(event) => setPositionForm((f) => ({ ...f, kode: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={positionForm.level} onValueChange={(value) => setPositionForm((f) => ({ ...f, level: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(POSITION_LEVEL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={positionForm.unitId || "__none"} onValueChange={(value) => setPositionForm((f) => ({ ...f, unitId: value === "__none" ? "" : value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih unit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Tanpa unit —</SelectItem>
                  {(units ?? []).map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Atasan langsung</Label>
              <Select value={positionForm.reportsToPositionId || "__none"} onValueChange={(value) => setPositionForm((f) => ({ ...f, reportsToPositionId: value === "__none" ? "" : value }))}>
                <SelectTrigger><SelectValue placeholder="Tanpa atasan (root)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Tanpa atasan (root) —</SelectItem>
                  {(positions ?? []).map((position) => (
                    <SelectItem key={position.id} value={position.id}>{position.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Input value={positionForm.keterangan} onChange={(event) => setPositionForm((f) => ({ ...f, keterangan: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={positionForm.isStructural}
                onChange={(event) => setPositionForm((f) => ({ ...f, isStructural: event.target.checked }))}
              />
              Jabatan struktural (pimpinan unit)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPositionOpen(false)}>Batal</Button>
            <Button onClick={handleSavePosition} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unit dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unit / bidang baru</DialogTitle>
            <DialogDescription>Kode otomatis dari nama bila dikosongkan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama unit</Label>
              <Input value={unitForm.nama} onChange={(event) => setUnitForm((f) => ({ ...f, nama: event.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kode (opsional)</Label>
                <Input value={unitForm.kode} onChange={(event) => setUnitForm((f) => ({ ...f, kode: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Jenis</Label>
                <Select value={unitForm.type} onValueChange={(value) => setUnitForm((f) => ({ ...f, type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BIDANG">Bidang</SelectItem>
                    <SelectItem value="BAGIAN">Bagian</SelectItem>
                    <SelectItem value="LEMBAGA">Lembaga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Input value={unitForm.keterangan} onChange={(event) => setUnitForm((f) => ({ ...f, keterangan: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSaveUnit} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
