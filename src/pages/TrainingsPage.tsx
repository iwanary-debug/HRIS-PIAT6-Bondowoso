/**
 * Pelatihan — events, participants, certificates and the training dashboard
 * (total, peserta, upcoming, sertifikasi, biaya).
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, CalendarRange, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, LoadingState, describeError } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
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
import { formatCurrency, formatDate } from "@/lib/format";
import { TRAINING_STATUS_LABELS } from "@/domain/development";
import type { Id } from "../../convex/_generated/dataModel";

interface TrainingRow {
  id: string;
  kode: string;
  name: string;
  type: string;
  organizer: string;
  startDate: string;
  endDate: string;
  location?: string;
  status: string;
  cost: number;
  jumlahPeserta: number;
  selesai: number;
  peserta: {
    id: string;
    employeeId: string;
    namaLengkap: string;
    niy: string;
    status: string;
    certificateNumber?: string;
    score?: number;
  }[];
}

export default function TrainingsPage() {
  const { can } = useAuth();
  const canEdit = can("HR_TRAINING_EDIT");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [participantsTarget, setParticipantsTarget] = React.useState<TrainingRow | null>(null);
  const [participantDraft, setParticipantDraft] = React.useState<Record<string, { include: boolean; status: string; certificateNumber: string; score: string }>>({});
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    type: "",
    organizer: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    location: "",
    cost: 0,
    notes: "",
  });

  const trainings = useQuery(api.trainings.list, { status: statusFilter === "all" ? undefined : statusFilter });
  const dashboard = useQuery(api.trainings.dashboard, {});
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const saveMutation = useMutation(api.trainings.save);
  const setParticipantsMutation = useMutation(api.trainings.setParticipants);
  const setStatusMutation = useMutation(api.trainings.setStatus);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.type.trim() || !form.organizer.trim()) {
      toast.error("Nama, jenis, dan penyelenggara wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await saveMutation({
        name: form.name,
        type: form.type,
        organizer: form.organizer,
        startDate: form.startDate,
        endDate: form.endDate,
        location: form.location || undefined,
        cost: form.cost || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Pelatihan dibuat", { description: "Tambahkan peserta melalui tombol Kelola Peserta." });
      setCreateOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const openParticipants = (training: TrainingRow) => {
    const draft: Record<string, { include: boolean; status: string; certificateNumber: string; score: string }> = {};
    for (const participant of training.peserta) {
      draft[participant.employeeId] = {
        include: true,
        status: participant.status,
        certificateNumber: participant.certificateNumber ?? "",
        score: participant.score !== undefined ? String(participant.score) : "",
      };
    }
    setParticipantDraft(draft);
    setParticipantsTarget(training);
  };

  const handleSaveParticipants = async () => {
    if (!participantsTarget) return;
    const entries = Object.entries(participantDraft)
      .filter(([, draft]) => draft.include)
      .map(([employeeId, draft]) => ({
        employeeId: employeeId as Id<"employees">,
        status: draft.status || "PLANNED",
        certificateNumber: draft.certificateNumber || undefined,
        score: draft.score ? Number(draft.score) : undefined,
      }));
    setSaving(true);
    try {
      await setParticipantsMutation({ trainingId: participantsTarget.id as Id<"trainings">, entries });
      toast.success(`Peserta tersimpan (${entries.length})`);
      setParticipantsTarget(null);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSetStatus = async (id: string, status: string) => {
    try {
      await setStatusMutation({ id: id as Id<"trainings">, status });
      toast.success(`Status → ${TRAINING_STATUS_LABELS[status as keyof typeof TRAINING_STATUS_LABELS] ?? status}`);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const toggleParticipant = (employeeId: string) =>
    setParticipantDraft((current) => ({
      ...current,
      [employeeId]: current[employeeId] ?? { include: false, status: "PLANNED", certificateNumber: "", score: "" },
    }));

  return (
    <>
      <PageHeader
        title="Pelatihan"
        description="Event pelatihan, peserta, sertifikat, biaya, dan kompetensi yang diperoleh — dasar data pengembangan SDM."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Pelatihan" }]}
        actions={
          canEdit && (
            <Button
              onClick={() => {
                setForm((f) => ({ ...f, name: "", type: "", organizer: "", notes: "" }));
                setCreateOpen(true);
              }}
            >
              <Plus /> Pelatihan Baru
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Pelatihan" value={dashboard?.totalTraining ?? 0} icon={CalendarRange} />
        <KpiCard label="Total Peserta" value={dashboard?.totalPeserta ?? 0} icon={Users} tone="sky" hint={`${dashboard?.uniquePeserta ?? 0} karyawan unik`} />
        <KpiCard label="Mendatang / Berlangsung" value={`${dashboard?.Mendatang ?? 0} / ${dashboard?.berlangsung ?? 0}`} icon={CalendarRange} tone="amber" />
        <KpiCard label="Sertifikat Terbit" value={dashboard?.totalSertifikat ?? 0} icon={BadgeCheck} tone="emerald" />
      </div>

      <SectionCard
        title="Daftar pelatihan"
        description="Klik Kelola Peserta untuk mengatur daftar, status penyelesaian, skor dan nomor sertifikat."
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {Object.entries(TRAINING_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {trainings === undefined ? (
          <LoadingState label="Memuat pelatihan…" />
        ) : trainings.length === 0 ? (
          <EmptyState title="Belum ada pelatihan" description="Buat event pelatihan pertama untuk mulai mendata peserta." className="border-0" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Pelatihan</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Peserta</TableHead>
                  <TableHead>Biaya</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(trainings as TrainingRow[]).map((training) => (
                  <TableRow key={training.id}>
                    <TableCell className="font-mono text-xs">{training.kode}</TableCell>
                    <TableCell>
                      <p className="font-medium">{training.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {training.type} · {training.organizer}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(training.startDate)} – {formatDate(training.endDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {training.jumlahPeserta} {training.selesai > 0 && <span className="text-xs text-emerald-700">({training.selesai} selesai)</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{training.cost > 0 ? formatCurrency(training.cost) : "—"}</TableCell>
                    <TableCell>
                      <StatusBadge
                        value={training.status === "COMPLETED" ? "APPROVED" : training.status === "ONGOING" ? "IN_FOLLOW_UP" : training.status === "CANCELLED" ? "CANCELLED" : "DRAFT"}
                        label={TRAINING_STATUS_LABELS[training.status as keyof typeof TRAINING_STATUS_LABELS] ?? training.status}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <>
                            <Button variant="outlineNavy" size="sm" onClick={() => openParticipants(training)}>
                              <Users /> Peserta
                            </Button>
                            {training.status === "PLANNED" && (
                              <Button size="sm" variant="ghost" onClick={() => void handleSetStatus(training.id, "ONGOING")}>
                                Mulai
                              </Button>
                            )}
                            {training.status === "ONGOING" && (
                              <Button size="sm" variant="ghost" onClick={() => void handleSetStatus(training.id, "COMPLETED")}>
                                Selesaikan
                              </Button>
                            )}
                          </>
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Pelatihan baru</DialogTitle>
            <DialogDescription>Kode pelatihan dibuat otomatis (TRN/tahun/urutan).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nama pelatihan</Label>
              <Input value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <Input value={form.type} onChange={(event) => setForm((f) => ({ ...f, type: event.target.value }))} placeholder="Workshop / Diklat / Seminar" />
            </div>
            <div className="space-y-1.5">
              <Label>Penyelenggara</Label>
              <Input value={form.organizer} onChange={(event) => setForm((f) => ({ ...f, organizer: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal mulai</Label>
              <Input type="date" value={form.startDate} onChange={(event) => setForm((f) => ({ ...f, startDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal selesai</Label>
              <Input type="date" value={form.endDate} onChange={(event) => setForm((f) => ({ ...f, endDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Lokasi</Label>
              <Input value={form.location} onChange={(event) => setForm((f) => ({ ...f, location: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Biaya (Rp)</Label>
              <Input type="number" value={form.cost} onChange={(event) => setForm((f) => ({ ...f, cost: Number(event.target.value) }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Catatan</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Participants dialog */}
      <Dialog open={!!participantsTarget} onOpenChange={(open) => !open && setParticipantsTarget(null)}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Peserta — {participantsTarget?.name}</DialogTitle>
            <DialogDescription>
              Centang karyawan sebagai peserta; nomor sertifikat diisi setelah pelatihan selesai.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto scrollbar-thin rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">✓</TableHead>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sertifikat</TableHead>
                  <TableHead>Skor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(employees?.data ?? []).map((employee) => {
                  const draft = participantDraft[employee._id] ?? { include: false, status: "PLANNED", certificateNumber: "", score: "" };
                  return (
                    <TableRow key={employee._id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={draft.include}
                          onChange={() => toggleParticipant(employee._id)}
                          className="size-4"
                        />
                      </TableCell>
                      <TableCell>
                        <Link to={`/app/employees/${employee._id}`} className="font-medium hover:text-primary">
                          {employee.namaLengkap}
                        </Link>
                        <p className="text-xs text-muted-foreground">{employee.niy}</p>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={draft.status}
                          onValueChange={(value) =>
                            setParticipantDraft((current) => ({ ...current, [employee._id]: { ...draft, status: value } }))
                          }
                          disabled={!draft.include}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(TRAINING_STATUS_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={draft.certificateNumber}
                          onChange={(event) =>
                            setParticipantDraft((current) => ({ ...current, [employee._id]: { ...draft, certificateNumber: event.target.value } }))
                          }
                          className="h-8 w-40"
                          disabled={!draft.include}
                          placeholder="No. sertifikat"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={draft.score}
                          onChange={(event) =>
                            setParticipantDraft((current) => ({ ...current, [employee._id]: { ...draft, score: event.target.value } }))
                          }
                          className="h-8 w-20"
                          disabled={!draft.include}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParticipantsTarget(null)}>Batal</Button>
            <Button onClick={handleSaveParticipants} disabled={saving}>Simpan Peserta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
