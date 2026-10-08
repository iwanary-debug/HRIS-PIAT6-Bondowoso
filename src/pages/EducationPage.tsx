/**
 * Pendidikan & Kompetensi — full education history (beyond the 3 flat workbook
 * columns), competency master and per-employee competency levels.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { GraduationCap, Medal, Plus, Trash2 } from "lucide-react";
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
import { formatDate } from "@/lib/format";
import { EDUCATION_LEVEL_OPTIONS, COMPETENCY_LEVEL_LABELS } from "@/domain/development";
import type { Id } from "../../convex/_generated/dataModel";

export default function EducationPage() {
  const { can } = useAuth();
  const canEdit = can("HR_EDIT");
  const canDelete = can("HR_DELETE");
  const [tab, setTab] = React.useState("pendidikan");
  const [employeeFilter, setEmployeeFilter] = React.useState("all");
  const [levelFilter, setLevelFilter] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [masterOpen, setMasterOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    employeeId: "",
    level: "S1",
    institution: "",
    major: "",
    graduationYear: "",
    isCurrent: true,
    notes: "",
  });
  const [assignForm, setAssignForm] = React.useState({ employeeId: "", competencyId: "", level: 3, assessedAt: new Date().toISOString().slice(0, 10), notes: "" });
  const [masterForm, setMasterForm] = React.useState({ name: "", category: "", description: "" });

  const employees = useQuery(api.employees.list, {
    includeInactive: true,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });
  const education = useQuery(api.education.listEducation, {});
  const competencies = useQuery(api.education.listCompetencies, {});
  const master = useQuery(api.education.listMaster, { includeInactive: true });

  const saveEducationMutation = useMutation(api.education.saveEducation);
  const deleteEducationMutation = useMutation(api.education.deleteEducation);
  const assignMutation = useMutation(api.education.assignCompetency);
  const saveMasterMutation = useMutation(api.education.saveMaster);

  const filteredEducation = (education ?? []).filter((record) => {
    if (employeeFilter !== "all" && record.employeeId !== employeeFilter) return false;
    if (levelFilter !== "all" && record.level !== levelFilter) return false;
    return true;
  });

  const handleSave = async () => {
    if (!form.employeeId || !form.institution.trim()) {
      toast.error("Pilih karyawan dan isi institusi.");
      return;
    }
    setSaving(true);
    try {
      await saveEducationMutation({
        employeeId: form.employeeId as Id<"employees">,
        level: form.level,
        institution: form.institution.trim(),
        major: form.major || undefined,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : null,
        isCurrent: form.isCurrent,
        notes: form.notes || undefined,
      });
      toast.success("Riwayat pendidikan disimpan");
      setOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEducationMutation({ id: id as Id<"educationRecords"> });
      toast.success("Riwayat pendidikan dihapus");
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleAssign = async () => {
    if (!assignForm.employeeId || !assignForm.competencyId) {
      toast.error("Pilih karyawan dan kompetensi.");
      return;
    }
    setSaving(true);
    try {
      await assignMutation({
        employeeId: assignForm.employeeId as Id<"employees">,
        competencyId: assignForm.competencyId as Id<"competencies">,
        level: assignForm.level,
        assessedAt: assignForm.assessedAt,
        notes: assignForm.notes || undefined,
      });
      toast.success("Kompetensi ditetapkan");
      setAssignOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMaster = async () => {
    if (!masterForm.name.trim() || !masterForm.category.trim()) {
      toast.error("Nama dan kategori wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await saveMasterMutation({ name: masterForm.name, category: masterForm.category, description: masterForm.description || undefined });
      toast.success("Kompetensi master tersimpan");
      setMasterOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const s1Plus = (education ?? []).filter((record) => ["S1", "S2", "S3"].includes(record.level) && record.isCurrent).length;

  return (
    <>
      <PageHeader
        title="Pendidikan & Kompetensi"
        description="Histori pendidikan penuh per karyawan — bukan hanya tiga kolom dari Excel — plus peta kompetensi dan levelnya."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Pendidikan & Kompetensi" }]}
        actions={
          canEdit && (
            <>
              <Button variant="outlineNavy" onClick={() => setMasterOpen(true)}>
                <Medal /> Kompetensi Master
              </Button>
              <Button onClick={() => setOpen(true)}>
                <Plus /> Tambah Pendidikan
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Riwayat Pendidikan" value={education?.length ?? 0} icon={GraduationCap} />
        <KpiCard label="Karyawan S1+" value={s1Plus} icon={GraduationCap} tone="emerald" />
        <KpiCard label="Master Kompetensi" value={master?.length ?? 0} icon={Medal} tone="sky" />
        <KpiCard label="Asignasi Kompetensi" value={competencies?.length ?? 0} icon={Medal} tone="slate" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pendidikan"><GraduationCap /> Pendidikan</TabsTrigger>
          <TabsTrigger value="kompetensi"><Medal /> Kompetensi</TabsTrigger>
        </TabsList>

        <TabsContent value="pendidikan">
          <SectionCard
            title="Riwayat pendidikan seluruh karyawan"
            actions={
              <div className="flex gap-2">
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua karyawan</SelectItem>
                    {(employees?.data ?? []).map((employee) => (
                      <SelectItem key={employee._id} value={employee._id}>{employee.namaLengkap}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua jenjang</SelectItem>
                    {EDUCATION_LEVEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          >
            {education === undefined ? (
              <LoadingState label="Memuat pendidikan…" />
            ) : filteredEducation.length === 0 ? (
              <EmptyState
                title="Belum ada riwayat pendidikan"
                description="Riwayat otomatis terisi bila kolom pendidikan terisi saat import; tambahkan manual untuk melengkapi."
                className="border-0"
              />
            ) : (
              <div className="max-h-[520px] overflow-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Jenjang</TableHead>
                      <TableHead>Institusi</TableHead>
                      <TableHead>Jurusan</TableHead>
                      <TableHead>Tahun</TableHead>
                      <TableHead>Status</TableHead>
                      {canDelete && <TableHead className="text-right">Aksi</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEducation.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Link to={`/app/employees/${record.employeeId}`} className="font-medium hover:text-primary">
                            {record.namaLengkap}
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium">{record.level}</TableCell>
                        <TableCell>{record.institution}</TableCell>
                        <TableCell>{record.major ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{record.graduationYear ?? "—"}</TableCell>
                        <TableCell>
                          {record.isCurrent ? <StatusBadge value="APPROVED" label="Terkini" /> : <span className="text-xs text-muted-foreground">Riwayat</span>}
                        </TableCell>
                        {canDelete && (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => void handleDelete(record.id)} aria-label="Hapus">
                              <Trash2 className="size-4 text-red-600" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="kompetensi">
          <SectionCard
            title="Asignasi kompetensi karyawan"
            description="Level 1–5: Pemula, Dasar, Menengah, Mahir, Ahli."
            actions={
              canEdit && (
                <>
                  <Button variant="outlineNavy" onClick={() => setMasterOpen(true)}>
                    <Plus /> Master
                  </Button>
                  <Button onClick={() => setAssignOpen(true)}>
                    <Plus /> Tetapkan Kompetensi
                  </Button>
                </>
              )
            }
          >
            {competencies === undefined ? (
              <LoadingState label="Memuat kompetensi…" />
            ) : competencies.length === 0 ? (
              <EmptyState title="Belum ada asignasi kompetensi" description="Tetapkan kompetensi beserta level penilaiannya." className="border-0" />
            ) : (
              <div className="max-h-[520px] overflow-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Kompetensi</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Dinilai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competencies.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Link to={`/app/employees/${record.employeeId}`} className="font-medium hover:text-primary">
                            {record.namaLengkap}
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium">{record.name}</TableCell>
                        <TableCell>{record.category}</TableCell>
                        <TableCell>
                          <StatusBadge value="APPROVED" label={`L${record.level} · ${COMPETENCY_LEVEL_LABELS[record.level] ?? record.level}`} />
                        </TableCell>
                        <TableCell>{formatDate(record.assessedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Education dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Riwayat pendidikan</DialogTitle>
            <DialogDescription>
              Menandai "Terkini" memindahkan penanda dari rekaman lain dan menyelaraskan kolom master karyawan.
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
              <Label>Jenjang</Label>
              <Select value={form.level} onValueChange={(value) => setForm((f) => ({ ...f, level: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EDUCATION_LEVEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tahun lulus</Label>
              <Input type="number" value={form.graduationYear} onChange={(event) => setForm((f) => ({ ...f, graduationYear: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Institusi</Label>
              <Input value={form.institution} onChange={(event) => setForm((f) => ({ ...f, institution: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jurusan</Label>
              <Input value={form.major} onChange={(event) => setForm((f) => ({ ...f, major: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.isCurrent} onChange={(event) => setForm((f) => ({ ...f, isCurrent: event.target.checked }))} />
              Jadikan pendidikan terkini
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign competency dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tetapkan kompetensi</DialogTitle>
            <DialogDescription>Level 1 (Pemula) hingga 5 (Ahli) sesuai penilaian atasan/evaluator.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Karyawan</Label>
              <Select value={assignForm.employeeId} onValueChange={(value) => setAssignForm((f) => ({ ...f, employeeId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan" /></SelectTrigger>
                <SelectContent>
                  {(employees?.data ?? []).map((employee) => (
                    <SelectItem key={employee._id} value={employee._id}>{employee.namaLengkap} — {employee.niy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Kompetensi</Label>
              <Select value={assignForm.competencyId} onValueChange={(value) => setAssignForm((f) => ({ ...f, competencyId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih kompetensi" /></SelectTrigger>
                <SelectContent>
                  {(master ?? []).map((competency) => (
                    <SelectItem key={competency._id} value={competency._id}>{competency.name} ({competency.category})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Level (1–5)</Label>
              <Input type="number" min={1} max={5} value={assignForm.level} onChange={(event) => setAssignForm((f) => ({ ...f, level: Number(event.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal penilaian</Label>
              <Input type="date" value={assignForm.assessedAt} onChange={(event) => setAssignForm((f) => ({ ...f, assessedAt: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Batal</Button>
            <Button onClick={handleAssign} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Master dialog */}
      <Dialog open={masterOpen} onOpenChange={setMasterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kompetensi master</DialogTitle>
            <DialogDescription>Daftar kompetensi yang dapat ditetapkan ke karyawan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={masterForm.name} onChange={(event) => setMasterForm((f) => ({ ...f, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Input value={masterForm.category} onChange={(event) => setMasterForm((f) => ({ ...f, category: event.target.value }))} placeholder="Akademik / Administrasi / …" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Deskripsi</Label>
              <Input value={masterForm.description} onChange={(event) => setMasterForm((f) => ({ ...f, description: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMasterOpen(false)}>Batal</Button>
            <Button onClick={handleSaveMaster} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
