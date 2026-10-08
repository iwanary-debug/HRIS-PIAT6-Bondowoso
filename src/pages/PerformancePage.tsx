/**
 * Penilaian Kinerja — configurable indicators (data, not code), weighted
 * score computation and the DRAFT → FINALIZED lifecycle.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ClipboardCheck, Plus, Target } from "lucide-react";
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
import { formatPeriod } from "@/lib/format";
import { PERFORMANCE_INDICATOR_TYPE, computePerformanceScore, performanceGrade } from "@/domain/development";
import type { Id } from "../../convex/_generated/dataModel";

interface AssessmentRow {
  id: string;
  employeeId: string;
  namaLengkap: string;
  niy: string;
  bidang?: string;
  period: string;
  status: string;
  finalScore: number | null;
  grade: string | null;
  evaluatorName?: string;
}

interface IndicatorRow {
  id: string;
  name: string;
  type: string;
  weight: number;
  description?: string;
}

export default function PerformancePage() {
  const { can } = useAuth();
  const canEdit = can("HR_PERFORMANCE_EDIT");
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = React.useState(currentPeriod);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [indicatorOpen, setIndicatorOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [scores, setScores] = React.useState<Record<string, { score: string; notes: string }>>({});
  const [indicatorForm, setIndicatorForm] = React.useState({ name: "", type: "SCORE", weight: 25, description: "" });

  const assessments = useQuery(api.performance.list, { period });
  const indicators = useQuery(api.performance.listIndicators, {});
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });

  const saveAssessmentMutation = useMutation(api.performance.saveAssessment);
  const saveIndicatorMutation = useMutation(api.performance.saveIndicator);

  const liveScore = React.useMemo(() => {
    const list = (indicators ?? []).map((indicator) => ({
      score: scores[indicator.id]?.score ? Number(scores[indicator.id]!.score) : undefined,
      weight: indicator.weight,
    }));
    return computePerformanceScore(list);
  }, [indicators, scores]);

  const resetForm = () => {
    setEmployeeId("");
    setSummary("");
    setScores({});
  };

  const handleSave = async (finalize: boolean) => {
    if (!employeeId) {
      toast.error("Pilih karyawan terlebih dahulu.");
      return;
    }
    const payload = (indicators ?? []).map((indicator) => ({
      indicatorId: indicator.id as Id<"performanceIndicators">,
      weight: indicator.weight,
      score: scores[indicator.id]?.score ? Number(scores[indicator.id]!.score) : undefined,
      notes: scores[indicator.id]?.notes || undefined,
    }));
    setSaving(true);
    try {
      const result = await saveAssessmentMutation({
        employeeId: employeeId as Id<"employees">,
        period,
        summary: summary || undefined,
        scores: payload,
        finalize,
      });
      toast.success(
        finalize ? `Penilaian difinalkan — skor ${result.finalScore ?? "—"} (${result.grade ?? "—"})` : "Draf penilaian disimpan",
      );
      setCreateOpen(false);
      resetForm();
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIndicator = async () => {
    if (!indicatorForm.name.trim()) {
      toast.error("Nama indikator wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await saveIndicatorMutation({
        name: indicatorForm.name,
        type: indicatorForm.type,
        weight: indicatorForm.weight,
        description: indicatorForm.description || undefined,
      });
      toast.success("Indikator tersimpan");
      setIndicatorOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const graded = (assessments ?? []).filter((a) => a.finalScore !== null);
  const average = graded.length
    ? Math.round((graded.reduce((sum, a) => sum + (a.finalScore ?? 0), 0) / graded.length) * 100) / 100
    : 0;

  return (
    <>
      <PageHeader
        title="Penilaian Kinerja"
        description="Model penilaian dapat dikonfigurasi: indikator membawa jenis dan bobotnya sendiri. Skor akhir = rata-rata tertimbang; finalisasi menuntut total bobot 100."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Penilaian Kinerja" }]}
        actions={
          <>
            {canEdit && (
              <Button variant="outlineNavy" onClick={() => setIndicatorOpen(true)}>
                <Target /> Indikator
              </Button>
            )}
            {canEdit && (
              <Button
                onClick={() => {
                  resetForm();
                  setCreateOpen(true);
                }}
              >
                <Plus /> Penilaian Baru
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Penilaian Periode" value={assessments?.length ?? 0} icon={ClipboardCheck} hint={formatPeriod(period)} />
        <KpiCard label="Rata-rata Skor" value={average || "—"} icon={Target} tone="emerald" />
        <KpiCard label="Difinalkan" value={(assessments ?? []).filter((a) => a.status === "FINALIZED").length} icon={ClipboardCheck} tone="sky" />
        <KpiCard label="Indikator Aktif" value={indicators?.length ?? 0} icon={Target} tone="slate" />
      </div>

      <SectionCard
        title="Daftar penilaian"
        description="Satu penilaian per karyawan per periode; finalisasi mengunci data."
        actions={
          <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="w-40" />
        }
      >
        {assessments === undefined ? (
          <LoadingState label="Memuat penilaian…" />
        ) : assessments.length === 0 ? (
          <EmptyState
            title={`Belum ada penilaian periode ${formatPeriod(period)}`}
            description="Buat penilaian baru dengan indikator yang telah dikonfigurasi."
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">Skor</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Evaluator</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(assessments as AssessmentRow[]).map((assessment) => (
                  <TableRow key={assessment.id}>
                    <TableCell>
                      <Link to={`/app/employees/${assessment.employeeId}`} className="font-medium hover:text-primary">
                        {assessment.namaLengkap}
                      </Link>
                      <p className="text-xs text-muted-foreground">{assessment.niy} · {assessment.bidang ?? "—"}</p>
                    </TableCell>
                    <TableCell>{formatPeriod(assessment.period)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{assessment.finalScore ?? "—"}</TableCell>
                    <TableCell>{assessment.grade ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge value={assessment.status === "FINALIZED" ? "APPROVED" : "DRAFT"} label={assessment.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{assessment.evaluatorName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* Assessment dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Penilaian kinerja — {formatPeriod(period)}</DialogTitle>
            <DialogDescription>
              Skor 0–100 per indikator. Bobot diambil dari konfigurasi indikator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Karyawan</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan aktif" /></SelectTrigger>
                <SelectContent>
                  {(employees?.data ?? []).map((employee) => (
                    <SelectItem key={employee._id} value={employee._id}>{employee.namaLengkap} — {employee.niy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(indicators ?? []).length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Belum ada indikator. Tambahkan melalui tombol Indikator, atau jalankan seed dari Pengaturan.
              </p>
            ) : (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indikator</TableHead>
                      <TableHead className="text-right">Bobot</TableHead>
                      <TableHead className="w-28">Skor</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(indicators ?? []).map((indicator: IndicatorRow) => (
                      <TableRow key={indicator.id}>
                        <TableCell>
                          <p className="font-medium">{indicator.name}</p>
                          <p className="text-xs text-muted-foreground">{indicator.type}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{indicator.weight}%</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={scores[indicator.id]?.score ?? ""}
                            onChange={(event) =>
                              setScores((current) => ({
                                ...current,
                                [indicator.id]: { score: event.target.value, notes: current[indicator.id]?.notes ?? "" },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={scores[indicator.id]?.notes ?? ""}
                            onChange={(event) =>
                              setScores((current) => ({
                                ...current,
                                [indicator.id]: { score: current[indicator.id]?.score ?? "", notes: event.target.value },
                              }))
                            }
                            placeholder="Opsional"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5">
              <span className="text-sm text-muted-foreground">Skor tertimbang saat ini</span>
              <span className="text-base font-bold tabular-nums">
                {liveScore ?? "—"} {liveScore !== null && <span className="text-sm font-medium text-muted-foreground">({performanceGrade(liveScore)})</span>}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label>Ringkasan / catatan evaluator</Label>
              <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button variant="outlineNavy" onClick={() => void handleSave(false)} disabled={saving}>Simpan Draf</Button>
            <Button onClick={() => void handleSave(true)} disabled={saving}>Finalisasi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Indicator dialog */}
      <Dialog open={indicatorOpen} onOpenChange={setIndicatorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Indikator penilaian</DialogTitle>
            <DialogDescription>
              Jenis: SCORE (0–100), PERCENTAGE (0–100), NUMERIC, BOOLEAN. Bobot dalam persen.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nama indikator</Label>
              <Input value={indicatorForm.name} onChange={(event) => setIndicatorForm((f) => ({ ...f, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <Select value={indicatorForm.type} onValueChange={(value) => setIndicatorForm((f) => ({ ...f, type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PERFORMANCE_INDICATOR_TYPE).map(([key, value]) => (
                    <SelectItem key={key} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bobot (%)</Label>
              <Input type="number" min={1} max={100} value={indicatorForm.weight} onChange={(event) => setIndicatorForm((f) => ({ ...f, weight: Number(event.target.value) }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Deskripsi</Label>
              <Input value={indicatorForm.description} onChange={(event) => setIndicatorForm((f) => ({ ...f, description: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIndicatorOpen(false)}>Batal</Button>
            <Button onClick={handleSaveIndicator} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
