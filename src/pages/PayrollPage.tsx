/**
 * Payroll — configurable foundation: components, salary structures, periods,
 * payslip generation and the status lifecycle DRAFT → APPROVED → PAID.
 * No payroll rule is hard-coded; percentages/nominals live in the data.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { Banknote, Calculator, FileStack, Mail, Plus, Wallet } from "lucide-react";
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
import { formatCurrency, formatPeriod } from "@/lib/format";
import { downloadCsv } from "@/lib/exporters";
import { PAYROLL_PERIOD_STATUS_LABELS } from "@/domain/payroll";
import type { Id } from "../../convex/_generated/dataModel";

interface ComponentRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  calculation: string;
  value: number;
  basedOnCode?: string;
  taxable: boolean;
  active: boolean;
  description?: string;
}

export default function PayrollPage() {
  const { can } = useAuth();
  const canEdit = can("HR_PAYROLL_EDIT");
  const [tab, setTab] = React.useState("periods");
  const [activePeriod, setActivePeriod] = React.useState<string | null>(null);
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const [componentOpen, setComponentOpen] = React.useState(false);
  const [salaryOpen, setSalaryOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [periodForm, setPeriodForm] = React.useState({ period: new Date().toISOString().slice(0, 7), description: "" });
  const [componentForm, setComponentForm] = React.useState({
    code: "",
    name: "",
    kind: "EARNING",
    calculation: "FIXED",
    value: 0,
    basedOnCode: "",
    taxable: true,
    description: "",
  });
  const [salaryForm, setSalaryForm] = React.useState({ employeeId: "", baseSalary: 0, effectiveDate: new Date().toISOString().slice(0, 10) });

  const components = useQuery(api.payroll.listComponents, { includeInactive: true });
  const periods = useQuery(api.payroll.listPeriods, {});
  const employees = useQuery(api.employees.list, {
    status: ["AKTIF"],
    includeInactive: false,
    page: 1,
    pageSize: 200,
    sortBy: "namaLengkap",
    sortDir: "asc" as const,
  });
  const payslips = useQuery(
    api.payroll.listPayslips,
    activePeriod ? { periodId: activePeriod as Id<"payrollPeriods"> } : "skip",
  );

  const createPeriodMutation = useMutation(api.payroll.createPeriod);
  const generateMutation = useMutation(api.payroll.generate);
  const setPeriodStatusMutation = useMutation(api.payroll.setPeriodStatus);
  const sendPayslipsAction = useAction(api.mail.sendPayslipsForPeriod);
  const saveComponentMutation = useMutation(api.payroll.saveComponent);
  const setSalaryMutation = useMutation(api.payroll.setSalary);

  const handleCreatePeriod = async () => {
    setSaving(true);
    try {
      const year = periodForm.period.slice(0, 4);
      const month = Number(periodForm.period.slice(5, 7));
      const lastDay = new Date(Number(year), month, 0).getDate();
      await createPeriodMutation({
        period: periodForm.period,
        startDate: `${periodForm.period}-01`,
        endDate: `${periodForm.period}-${String(lastDay).padStart(2, "0")}`,
        description: periodForm.description || undefined,
      });
      toast.success("Periode dibuat", { description: "Hitung slip gaji setelah struktur gaji tersedia." });
      setPeriodOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async (periodId: string) => {
    setSaving(true);
    try {
      const result = await generateMutation({ periodId: periodId as Id<"payrollPeriods"> });
      toast.success(`Slip gaji dihitung: ${result.created} dibuat, ${result.skipped} dilewati`, {
        description: "Karyawan tanpa struktur gaji dilewati.",
      });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSetStatus = async (periodId: string, status: string) => {
    try {
      await setPeriodStatusMutation({ periodId: periodId as Id<"payrollPeriods">, status });
      toast.success(`Status periode → ${PAYROLL_PERIOD_STATUS_LABELS[status as keyof typeof PAYROLL_PERIOD_STATUS_LABELS] ?? status}`);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  /** Email every payslip of the selected period to the employee's own address. */
  const handleEmailPayslips = async () => {
    if (!activePeriod) return;
    setSaving(true);
    try {
      const result = await sendPayslipsAction({ periodId: activePeriod as Id<"payrollPeriods"> });
      if (result.sent > 0) {
        toast.success(`Slip gaji ${result.period} dikirim ke ${result.sent} karyawan`, {
          description: [
            result.skipped > 0 ? `${result.skipped} dilewati (email belum diatur)` : null,
            result.failed > 0 ? `${result.failed} gagal` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      } else {
        toast.warning("Tidak ada email terkirim", {
          description: "Email karyawan belum terisi, atau layanan email belum dikonfigurasi.",
        });
      }
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveComponent = async () => {    setSaving(true);
    try {
      await saveComponentMutation({
        code: componentForm.code.toUpperCase(),
        name: componentForm.name,
        kind: componentForm.kind,
        calculation: componentForm.calculation,
        value: componentForm.value,
        basedOnCode: componentForm.calculation === "PERCENTAGE_OF_COMPONENT" ? componentForm.basedOnCode || null : null,
        taxable: componentForm.taxable,
        description: componentForm.description || undefined,
      });
      toast.success("Komponen payroll disimpan");
      setComponentOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSetSalary = async () => {
    if (!salaryForm.employeeId) {
      toast.error("Pilih karyawan terlebih dahulu.");
      return;
    }
    setSaving(true);
    try {
      await setSalaryMutation({
        employeeId: salaryForm.employeeId as Id<"employees">,
        baseSalary: salaryForm.baseSalary,
        effectiveDate: salaryForm.effectiveDate,
      });
      toast.success("Struktur gaji tersimpan", { description: "Nilai tidak dicatat mentah di audit log." });
      setSalaryOpen(false);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const exportPayslips = () => {
    if (!payslips || !periods) return;
    const period = periods.find((p) => p.id === activePeriod);
    downloadCsv(
      `slip-gaji-${period?.period ?? "periode"}.csv`,
      [
        { key: "niy", label: "NIY" },
        { key: "namaLengkap", label: "Nama" },
        { key: "baseSalary", label: "Gaji Pokok" },
        { key: "totalEarnings", label: "Total Penghasilan" },
        { key: "totalDeductions", label: "Total Potongan" },
        { key: "netPay", label: "Diterima" },
        { key: "status", label: "Status" },
      ],
      payslips,
    );
  };

  const activePeriodRow = periods?.find((p) => p.id === activePeriod);

  return (
    <>
      <PageHeader
        title="Payroll & Benefit"
        description="Fondasi payroll yang dapat dikonfigurasi: komponen, struktur gaji, periode, dan slip gaji. Aturan resmi PIAT 6 tidak dikodekan di dalam program — nominal/persentase diatur pada data komponen."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Payroll" }]}
        actions={
          canEdit && (
            <>
              <Button variant="outlineNavy" onClick={() => setSalaryOpen(true)}>
                <Wallet /> Struktur Gaji
              </Button>
              <Button onClick={() => setPeriodOpen(true)}>
                <Plus /> Periode Baru
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Komponen Aktif" value={components?.filter((c) => c.active).length ?? 0} icon={Calculator} />
        <KpiCard label="Periode Terdaftar" value={periods?.length ?? 0} icon={FileStack} tone="sky" />
        <KpiCard
          label="Slip Periode Aktif"
          value={activePeriodRow?.jumlahSlip ?? 0}
          icon={FileStack}
          tone="emerald"
          hint={activePeriodRow ? formatPeriod(activePeriodRow.period) : undefined}
        />
        <KpiCard
          label="Total Diterima"
          value={formatCurrency(activePeriodRow?.totalNet ?? 0)}
          icon={Banknote}
          tone="slate"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="periods"><FileStack /> Periode & Slip</TabsTrigger>
          <TabsTrigger value="components"><Calculator /> Komponen</TabsTrigger>
        </TabsList>

        <TabsContent value="periods">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
            <SectionCard title="Periode payroll" description="Draf → Disetujui → Dibayar. Hanya Draf yang dapat dihitung ulang.">
              {periods === undefined ? (
                <LoadingState label="Memuat periode…" />
              ) : periods.length === 0 ? (
                <EmptyState title="Belum ada periode" description="Buat periode untuk mulai menghitung slip gaji." className="border-0" />
              ) : (
                <div className="space-y-2">
                  {periods.map((period) => (
                    <button
                      key={period.id}
                      type="button"
                      onClick={() => setActivePeriod(period.id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        activePeriod === period.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{formatPeriod(period.period)}</span>
                        <StatusBadge
                          value={period.status === "DRAFT" ? "DRAFT" : period.status === "APPROVED" ? "APPROVED" : period.status === "PAID" ? "PAID" : "CANCELLED"}
                          label={period.status}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {period.jumlahSlip} slip · {formatCurrency(period.totalNet)}
                      </p>
                      {canEdit && period.status === "DRAFT" && (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="outlineNavy" onClick={(event) => { event.stopPropagation(); void handleGenerate(period.id); }} disabled={saving}>
                            <Calculator /> Hitung
                          </Button>
                          <Button size="sm" variant="outlineNavy" onClick={(event) => { event.stopPropagation(); void handleSetStatus(period.id, "APPROVED"); }}>
                            Setujui
                          </Button>
                        </div>
                      )}
                      {canEdit && period.status === "APPROVED" && (
                        <Button size="sm" variant="navy" className="mt-2" onClick={(event) => { event.stopPropagation(); void handleSetStatus(period.id, "PAID"); }}>
                          <Banknote /> Tandai Dibayar
                        </Button>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={activePeriodRow ? `Slip gaji ${formatPeriod(activePeriodRow.period)}` : "Slip gaji"}
              description={activePeriodRow ? `Status ${activePeriodRow.status}. Nilai hanya tampil untuk pemegang HR_PAYROLL_VIEW.` : "Pilih periode di kiri untuk melihat slip."}
              actions={
                payslips && payslips.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outlineNavy" size="sm" onClick={exportPayslips}>
                      Ekspor CSV
                    </Button>
                    {canEdit && (
                      <Button size="sm" onClick={() => void handleEmailPayslips()} disabled={saving}>
                        <Mail className="size-3.5" />
                        Kirim Email
                      </Button>
                    )}
                  </div>
                )
              }
            >
              {!activePeriod ? (
                <EmptyState title="Belum ada periode dipilih" className="border-0" />
              ) : payslips === undefined ? (
                <LoadingState label="Memuat slip…" />
              ) : payslips.length === 0 ? (
                <EmptyState title="Belum ada slip" description="Klik Hitung pada periode Draf untuk menghasilkan slip." className="border-0" />
              ) : (
                <div className="max-h-[480px] overflow-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Karyawan</TableHead>
                        <TableHead className="text-right">Gaji Pokok</TableHead>
                        <TableHead className="text-right">Penghasilan</TableHead>
                        <TableHead className="text-right">Potongan</TableHead>
                        <TableHead className="text-right">Diterima</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslips.map((slip) => (
                        <TableRow key={slip.id}>
                          <TableCell>
                            <Link to={`/app/employees/${slip.employeeId}`} className="font-medium hover:text-primary">
                              {slip.namaLengkap}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">{slip.niy}</p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(slip.baseSalary)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(slip.totalEarnings)}</TableCell>
                          <TableCell className="text-right tabular-nums text-red-700">{formatCurrency(slip.totalDeductions)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(slip.netPay)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="components">
          <SectionCard
            title="Komponen penghasilan & potongan"
            description="Urutan deklarasi penting untuk komponen persentase — dihitung berurutan dari atas ke bawah."
            actions={
              canEdit && (
                <Button
                  onClick={() => {
                    setComponentForm({ code: "", name: "", kind: "EARNING", calculation: "FIXED", value: 0, basedOnCode: "", taxable: true, description: "" });
                    setComponentOpen(true);
                  }}
                >
                  <Plus /> Komponen Baru
                </Button>
              )
            }
          >
            {components === undefined ? (
              <LoadingState label="Memuat komponen…" />
            ) : components.length === 0 ? (
              <EmptyState title="Belum ada komponen" description="Jalankan seed atau tambahkan komponen manual." className="border-0" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Perhitungan</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                      <TableHead>Taxable</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {components.map((component: ComponentRow) => (
                      <TableRow key={component.id}>
                        <TableCell className="font-mono text-xs">{component.code}</TableCell>
                        <TableCell className="font-medium">{component.name}</TableCell>
                        <TableCell>{component.kind}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {component.calculation}
                          {component.basedOnCode ? ` · basis ${component.basedOnCode}` : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {component.calculation === "FIXED" ? formatCurrency(component.value) : `${component.value}%`}
                        </TableCell>
                        <TableCell>{component.taxable ? "Ya" : "Tidak"}</TableCell>
                        <TableCell><StatusBadge value={component.active ? "AKTIF" : "TIDAK_AKTIF"} label={component.active ? "Aktif" : "Nonaktif"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Period dialog */}
      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Periode payroll baru</DialogTitle>
            <DialogDescription>Satu periode per bulan (yyyy-mm).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Periode</Label>
              <Input type="month" value={periodForm.period} onChange={(event) => setPeriodForm((f) => ({ ...f, period: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Input value={periodForm.description} onChange={(event) => setPeriodForm((f) => ({ ...f, description: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodOpen(false)}>Batal</Button>
            <Button onClick={handleCreatePeriod} disabled={saving}>Buat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Component dialog */}
      <Dialog open={componentOpen} onOpenChange={setComponentOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Komponen payroll</DialogTitle>
            <DialogDescription>
              Persentase dihitung dari gaji pokok atau komponen lain. Nilai 0 berarti aturan belum ditetapkan HRD.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kode (A-Z, 0-9, _)</Label>
              <Input value={componentForm.code} onChange={(event) => setComponentForm((f) => ({ ...f, code: event.target.value.toUpperCase() }))} placeholder="TUNJANGAN_KEHADIRAN" />
            </div>
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={componentForm.name} onChange={(event) => setComponentForm((f) => ({ ...f, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <Select value={componentForm.kind} onValueChange={(value) => setComponentForm((f) => ({ ...f, kind: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EARNING">Penghasilan</SelectItem>
                  <SelectItem value="DEDUCTION">Potongan</SelectItem>
                  <SelectItem value="INFORMATIONAL">Informatif</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Perhitungan</Label>
              <Select value={componentForm.calculation} onValueChange={(value) => setComponentForm((f) => ({ ...f, calculation: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Nominal tetap</SelectItem>
                  <SelectItem value="PERCENTAGE_OF_BASE">% dari gaji pokok</SelectItem>
                  <SelectItem value="PERCENTAGE_OF_COMPONENT">% dari komponen lain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nilai</Label>
              <Input type="number" value={componentForm.value} onChange={(event) => setComponentForm((f) => ({ ...f, value: Number(event.target.value) }))} />
            </div>
            {componentForm.calculation === "PERCENTAGE_OF_COMPONENT" && (
              <div className="space-y-1.5">
                <Label>Berbasis komponen</Label>
                <Select value={componentForm.basedOnCode || "__none"} onValueChange={(value) => setComponentForm((f) => ({ ...f, basedOnCode: value === "__none" ? "" : value }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {(components ?? []).map((component) => (
                      <SelectItem key={component.id} value={component.code}>{component.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Deskripsi</Label>
              <Input value={componentForm.description} onChange={(event) => setComponentForm((f) => ({ ...f, description: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={componentForm.taxable} onChange={(event) => setComponentForm((f) => ({ ...f, taxable: event.target.checked }))} />
              Termasuk penghasilan kena pajak
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComponentOpen(false)}>Batal</Button>
            <Button onClick={handleSaveComponent} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary dialog */}
      <Dialog open={salaryOpen} onOpenChange={setSalaryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Struktur gaji karyawan</DialogTitle>
            <DialogDescription>
              Setiap perubahan membuat versi baru dengan tanggal efektif — histori gaji tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Karyawan</Label>
              <Select value={salaryForm.employeeId} onValueChange={(value) => setSalaryForm((f) => ({ ...f, employeeId: value }))}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan aktif" /></SelectTrigger>
                <SelectContent>
                  {(employees?.data ?? []).map((employee) => (
                    <SelectItem key={employee._id} value={employee._id}>{employee.namaLengkap} — {employee.niy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gaji pokok (Rp)</Label>
              <Input type="number" value={salaryForm.baseSalary} onChange={(event) => setSalaryForm((f) => ({ ...f, baseSalary: Number(event.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal efektif</Label>
              <Input type="date" value={salaryForm.effectiveDate} onChange={(event) => setSalaryForm((f) => ({ ...f, effectiveDate: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryOpen(false)}>Batal</Button>
            <Button onClick={handleSetSalary} disabled={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
