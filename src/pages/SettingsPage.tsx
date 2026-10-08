/**
 * Pengaturan — institution identity, reference-data bootstrap (seed),
 * attendance work hours, user/role administration and the permission matrix.
 */

import * as React from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Building2,
  Database,
  Download,
  HardDriveDownload,
  RotateCcw,
  ShieldCheck,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { LoadingState, describeError } from "@/components/hris/states";
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
import { formatDateTime } from "@/lib/format";
import { describeBackup, downloadBackup, type BackupMode } from "@/lib/backup";
import {
  RESTORE_MODE_LABELS,
  RESTORE_MODES,
  describePreview,
  type RestoreMode,
  type RestorePreview,
} from "@/domain/restore";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/permissions";
import type { Id } from "../../convex/_generated/dataModel";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  active: boolean;
  lastLoginAt?: number;
  employee: { id: string; namaLengkap: string; niy: string } | null;
}

export default function SettingsPage() {
  const [institutionForm, setInstitutionForm] = React.useState<{ name: string; subtitle: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const institution = useQuery(api.audit.institution, {});
  const seedStatus = useQuery(api.seed.status, {});
  const attendanceSettings = useQuery(api.attendance.workSettings, {});
  const users = useQuery(api.audit.listUsers, {});
  const matrix = useQuery(api.audit.roleMatrix, {});

  const saveInstitutionMutation = useMutation(api.audit.saveInstitution);
  const bootstrapMutation = useMutation(api.seed.bootstrap);
  const setWorkSettingsMutation = useMutation(api.attendance.setWorkSettings);
  const updateUserRoleMutation = useMutation(api.audit.updateUserRole);
  const linkUserMutation = useMutation(api.audit.linkUserToEmployee);
  const linkByNiyMutation = useMutation(api.audit.linkUserByNiy);
  const createUserMutation = useMutation(api.audit.createUser);
  const resetPasswordMutation = useMutation(api.audit.resetPassword);
  const selfRegistration = useQuery(api.audit.selfRegistration, {});
  const setSelfRegistrationMutation = useMutation(api.audit.setSelfRegistration);
  const createSnapshotMutation = useMutation(api.backup.createSnapshot);
  const saveSnapshotAction = useAction(api.backup.saveSnapshot);
  const snapshotUrlMutation = useMutation(api.backup.snapshotUrl);
  const backupHistory = useQuery(api.backup.history, {});
  const analyzeRestore = useMutation(api.restore.analyze);
  const executeRestore = useAction(api.restore.execute);
  const restorePreference = useQuery(api.restore.restoreSettings, {});
  const [restoreFile, setRestoreFile] = React.useState<unknown>(null);
  const [restoreName, setRestoreName] = React.useState("");
  const [restorePreview, setRestorePreview] = React.useState<RestorePreview | null>(null);
  const [restoreMode, setRestoreMode] = React.useState<RestoreMode>("MERGE");
  const [restoreConfirm, setRestoreConfirm] = React.useState("");
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const restoreInputRef = React.useRef<HTMLInputElement>(null);

  /** Read the file and ask the server what it contains. Nothing is written yet. */
  const handlePickRestore = async (file: File) => {
    setRestoreBusy(true);
    setRestorePreview(null);
    setRestoreConfirm("");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const preview = await analyzeRestore({ snapshot: parsed });
      setRestoreFile(parsed);
      setRestoreName(file.name);
      setRestorePreview(preview);
      setRestoreMode((restorePreference?.restoreMode as RestoreMode | undefined) ?? "MERGE");
      if (!preview.valid) {
        toast.error("Berkas tidak dapat dipakai", { description: preview.errors[0] });
      }
    } catch (err) {
      setRestoreFile(null);
      const described = describeError(err);
      toast.error("Berkas tidak terbaca", { description: described.message });
    } finally {
      setRestoreBusy(false);
    }
  };

  const handleRunRestore = async () => {
    if (!restoreFile || !restorePreview) return;
    setRestoreBusy(true);
    try {
      const result = await executeRestore({
        snapshot: restoreFile,
        mode: restoreMode,
        confirmRowCount: restorePreview.totalRows,
      });
      toast.success(
        `Pemulihan selesai: ${result.inserted.toLocaleString("id-ID")} baru, ${result.merged.toLocaleString("id-ID")} digabung`,
        { description: `Mode ${RESTORE_MODE_LABELS[restoreMode]}` },
      );
      setRestoreFile(null);
      setRestorePreview(null);
      setRestoreName("");
      setRestoreConfirm("");
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setRestoreBusy(false);
    }
  };
  const [backupBusy, setBackupBusy] = React.useState<BackupMode | null>(null);

  /**
   * The backup is downloaded to the operator's own disk — never left on the
   * backend, because a copy that dies with the project is not a backup.
   */
  const handleBackup = async (mode: BackupMode) => {
    setBackupBusy(mode);
    try {
      const snapshot = await createSnapshotMutation({ mode });
      const filename = downloadBackup(snapshot);
      toast.success(`Backup diunduh: ${filename}`, {
        description: describeBackup(snapshot),
        duration: 9000,
      });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setBackupBusy(null);
    }
  };

  /** Also keep a copy on the platform, so an accidental delete is recoverable. */
  const handleSaveOnPlatform = async (mode: BackupMode) => {
    setBackupBusy(mode);
    try {
      const result = await saveSnapshotAction({ mode });
      toast.success(`Cadangan tersimpan di server: ${result.filename}`, {
        description: `${result.totalRows.toLocaleString("id-ID")} baris · retensi 10 versi terbaru`,
      });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setBackupBusy(null);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const url = await snapshotUrlMutation({ id: id as Id<"backupSnapshots"> });
      if (!url) {
        toast.error("Berkas cadangan tidak ditemukan di server.");
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  React.useEffect(() => {
    if (institution) setInstitutionForm({ name: institution.name, subtitle: institution.subtitle ?? "" });
  }, [institution]);

  const handleSaveInstitution = async () => {
    if (!institutionForm?.name.trim()) {
      toast.error("Nama institusi wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await saveInstitutionMutation({ name: institutionForm.name, subtitle: institutionForm.subtitle || undefined });
      toast.success("Identitas institusi tersimpan");
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleBootstrap = async () => {
    setSaving(true);
    try {
      const report = await bootstrapMutation({});
      toast.success("Data referensi siap", {
        description: `${report.units} unit · ${report.positions} jabatan · ${report.components} komponen payroll · ${report.competencies} kompetensi · ${report.indicators} indikator`,
      });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAttendanceSettings = async (form: { workStart: string; workEnd: string; lateThreshold: number }) => {
    try {
      await setWorkSettingsMutation(form);
      toast.success("Jam kerja tersimpan");
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await updateUserRoleMutation({ userId: userId as Id<"users">, role });
      toast.success(`Peran diubah menjadi ${ROLE_LABELS[role as Role] ?? role}`);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleLinkEmployee = async (userId: string, employeeId: string) => {
    try {
      await linkUserMutation({
        userId: userId as Id<"users">,
        employeeId: employeeId === "__none" ? null : (employeeId as Id<"employees">),
      });
      toast.success(employeeId === "__none" ? "Tautan karyawan dilepas" : "Akun ditautkan ke karyawan");
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const [niyDrafts, setNiyDrafts] = React.useState<Record<string, string>>({});

  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newUser, setNewUser] = React.useState({
    name: "",
    email: "",
    role: ROLES.EMPLOYEE_SELF_SERVICE as string,
    niy: "",
    password: "",
    mustChangePassword: true,
  });

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newUser.password.length < 8) {
      toast.error("Kata sandi minimal 8 karakter");
      return;
    }
    setCreating(true);
    try {
      await createUserMutation({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        niy: newUser.niy.trim() || undefined,
        mustChangePassword: newUser.mustChangePassword,
      });
      toast.success("Pengguna dibuat", {
        description: `Sampaikan kata sandi ${newUser.mustChangePassword ? "sementara" : "ini"} kepada ${newUser.name} secara pribadi.`,
      });
      setCreateOpen(false);
      setNewUser({
        name: "",
        email: "",
        role: ROLES.EMPLOYEE_SELF_SERVICE,
        niy: "",
        password: "",
        mustChangePassword: true,
      });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    const password = window.prompt("Kata sandi sementara (minimal 8 karakter):");
    if (!password) return;
    if (password.length < 8) {
      toast.error("Kata sandi minimal 8 karakter");
      return;
    }
    try {
      await resetPasswordMutation({ userId: userId as Id<"users">, password });
      toast.success("Kata sandi dibuat ulang", {
        description: "Pengguna akan diminta mengganti kata sandi saat login berikutnya.",
      });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleToggleSelfRegistration = async (enabled: boolean) => {
    try {
      await setSelfRegistrationMutation({ enabled });
      toast.success(
        enabled ? "Pendaftaran mandiri dibuka" : "Pendaftaran mandiri ditutup",
        {
          description: enabled
            ? "Siapa pun bisa mendaftar di halaman masuk, peran awal Karyawan."
            : "Akun hanya bisa dibuat Super Admin dari halaman ini.",
        },
      );
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleLinkByNiy = async (userId: string) => {
    const niy = (niyDrafts[userId] ?? "").trim();
    if (!niy) {
      toast.error("NIY belum diisi", { description: "Ketik NIY karyawan dari Master Data." });
      return;
    }
    try {
      const result = await linkByNiyMutation({ userId: userId as Id<"users">, niy });
      setNiyDrafts((drafts) => ({ ...drafts, [userId]: "" }));
      toast.success("Akun berhasil ditautkan", {
        description: `${result.employeeName} (${result.niy})`,
      });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Identitas institusi, data referensi (unit, jabatan, komponen payroll, kompetensi, indikator kinerja), jam kerja kehadiran, serta administrasi pengguna & peran."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Pengaturan" }]}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Unit/Jabatan" value={`${seedStatus?.units ?? 0}/${seedStatus?.positions ?? 0}`} icon={Database} />
        <KpiCard label="Komponen Payroll" value={seedStatus?.components ?? 0} icon={Database} tone="sky" />
        <KpiCard label="Kompetensi/Indikator" value={`${seedStatus?.competencies ?? 0}/${seedStatus?.indicators ?? 0}`} icon={Database} tone="emerald" />
        <KpiCard label="Pengguna" value={seedStatus?.users ?? 0} icon={Users} tone="slate" />
      </div>

      <Tabs defaultValue="institusi">
        <TabsList>
          <TabsTrigger value="institusi"><Building2 /> Institusi</TabsTrigger>
          <TabsTrigger value="cadangan"><HardDriveDownload /> Cadangan</TabsTrigger>
          <TabsTrigger value="referensi"><Database /> Data Referensi</TabsTrigger>
          <TabsTrigger value="pengguna"><Users /> Pengguna & Peran</TabsTrigger>
          <TabsTrigger value="peran"><ShieldCheck /> Matriks Peran</TabsTrigger>
        </TabsList>

        <TabsContent value="institusi">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Identitas institusi" description="Tampil di landing, login, dan cetak laporan.">
              {institutionForm === null ? (
                <LoadingState label="Memuat…" />
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Nama institusi</Label>
                    <Input value={institutionForm.name} onChange={(event) => setInstitutionForm((f) => (f ? { ...f, name: event.target.value } : f))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Subjudul</Label>
                    <Input value={institutionForm.subtitle} onChange={(event) => setInstitutionForm((f) => (f ? { ...f, subtitle: event.target.value } : f))} />
                  </div>
                  <Button onClick={handleSaveInstitution} disabled={saving}>Simpan</Button>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Jam kerja kehadiran" description="Dipakai perhitungan terlambat & lembur otomatis.">
              {attendanceSettings === undefined ? (
                <LoadingState label="Memuat…" />
              ) : (
                <AttendanceSettingsForm
                  initial={attendanceSettings}
                  onSave={handleAttendanceSettings}
                  saving={saving}
                />
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="cadangan">
          <SectionCard
            title="Cadangkan data"
            description="Unduh seluruh data HRIS sebagai satu berkas JSON. Backend paket gratis tidak menyediakan backup otomatis, jadi berkas inilah satu-satunya salinan yang tersimpan di luar sistem."
          >
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
              <p className="font-semibold">Di mana berkas ini disimpan?</p>
              <p className="mt-1">
                Berkas masuk ke folder <strong>Unduhan</strong> komputer Anda. Setelah itu
                simpan sendiri ke Google Drive, Dropbox, atau flashdisk — jangan dianggap
                cadangan sebelum ada di media lain. Untuk data karyawan yang berisi NIK dan
                nomor rekening, simpan di folder Drive yang tidak dibagikan luas.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold text-foreground">Cadangan aman</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Menghapus NIK, BPJS, rekening, alamat, dan nomor HP. Aman bila
                  filenya perlu dibagikan atau dibuka orang lain.
                </p>
                <Button
                  className="mt-3"
                  onClick={() => void handleBackup("safe")}
                  disabled={backupBusy !== null}
                >
                  {backupBusy === "safe" ? "Menyiapkan…" : <><Download /> Unduh cadangan aman</>}
                </Button>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold text-foreground">Cadangan lengkap</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Menyertakan seluruh data sensitif. Hanya untuk arsip pribadi yang Anda
                  kontrol. Hash kata sandi dan sesi login tetap tidak ikut.
                </p>
                <Button
                  variant="outlineNavy"
                  className="mt-3"
                  onClick={() => void handleBackup("full")}
                  disabled={backupBusy !== null}
                >
                  {backupBusy === "full" ? "Menyiapkan…" : <><Download /> Unduh cadangan lengkap</>}
                </Button>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Setiap pembuatan cadangan tercatat di audit log sebagai aktivitas ekspor. Sebaiknya
              diunduh setiap selesai import besar, dan minimal satu kali sebulan.
            </p>
          </SectionCard>

          <SectionCard
            className="mt-4"
            title="Pulihkan dari berkas cadangan"
            description="Unggah berkas JSON cadangan untuk mengembalikan data. Sistem 먼저 menampilkan isinya untuk Anda periksa, dan baru memulihkan setelah Anda menyetujuinya."
          >
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handlePickRestore(file);
                event.target.value = "";
              }}
            />
            <Button
              variant="outlineNavy"
              onClick={() => restoreInputRef.current?.click()}
              disabled={restoreBusy}
            >
              <Upload /> Pilih berkas JSON
            </Button>

            {restorePreview && (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-semibold text-foreground">{restoreName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {describePreview(restorePreview)} · mode berkas: {restorePreview.mode}
                  </p>
                  {!restorePreview.isComplete && (
                    <p className="mt-2 flex items-start gap-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      Berkas mode aman: NIK, BPJS, rekening, dan alamat tidak ada di dalamnya.
                    </p>
                  )}

                  {restorePreview.errors.length > 0 && (
                    <ul className="mt-3 space-y-1 rounded bg-red-50 p-3 text-xs text-red-900">
                      {restorePreview.errors.map((error) => (
                        <li key={error}>• {error}</li>
                      ))}
                    </ul>
                  )}
                  {restorePreview.warnings.length > 0 && (
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        {restorePreview.warnings.length} catatan
                      </summary>
                      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-4">
                        {restorePreview.warnings.map((warning) => (
                          <li key={warning}>• {warning}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {restorePreview.valid && (
                    <div className="mt-3 max-h-52 overflow-y-auto rounded border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tabel</TableHead>
                            <TableHead className="text-right">Baris</TableHead>
                            <TableHead className="text-right">Baru</TableHead>
                            <TableHead className="text-right">Sudah ada</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {restorePreview.perTable
                            .filter((row) => row.rows > 0)
                            .map((row) => (
                              <TableRow key={row.table}>
                                <TableCell className="text-xs">{row.table}</TableCell>
                                <TableCell className="text-right text-xs">{row.rows}</TableCell>
                                <TableCell className="text-right text-xs">{row.newRows}</TableCell>
                                <TableCell className="text-right text-xs">{row.existingRows}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {restorePreview.valid && (
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <p className="text-sm font-semibold text-foreground">Cara memulihkan</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {RESTORE_MODES.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setRestoreMode(mode)}
                          className={`rounded-lg border p-3 text-left transition ${
                            restoreMode === mode
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <p className="text-sm font-medium">{RESTORE_MODE_LABELS[mode]}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {mode === "MERGE"
                              ? "Data yang sudah ada tetap disimpan; hanya yang belum ada yang ditambahkan. Aman untuk mencoba."
                              : "Semua data saat ini dihapus dulu, lalu diisi ulang dari berkas. Hasilnya sama persis dengan isi cadangan."}
                          </p>
                        </button>
                      ))}
                    </div>

                    {restoreMode === "REPLACE" && (
                      <p className="flex items-start gap-2 rounded bg-red-50 p-3 text-xs text-red-900">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        Mode Timpa Total menghapus seluruh data HRIS yang ada sekarang, termasuk
                        perubahan yang dibuat setelah cadangan diambil. Unduh cadangan terbaru dulu
                        bila ragu.
                      </p>
                    )}

                    <div className="space-y-1">
                      <Label htmlFor="restore-confirm">
                        Ketik <span className="font-mono font-semibold">{restorePreview.totalRows}</span>{" "}
                        untuk melanjutkan
                      </Label>
                      <Input
                        id="restore-confirm"
                        inputMode="numeric"
                        value={restoreConfirm}
                        onChange={(event) => setRestoreConfirm(event.target.value)}
                        placeholder={String(restorePreview.totalRows)}
                      />
                    </div>

                    <Button
                      onClick={() => void handleRunRestore()}
                      disabled={
                        restoreBusy || restoreConfirm.trim() !== String(restorePreview.totalRows)
                      }
                    >
                      {restoreBusy ? "Memulihkan…" : <><RotateCcw /> Pulihkan sekarang</>}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard
            className="mt-4"
            title="Cadangan otomatis di server"
            description="Sistem menyimpan satu cadangan lengkap setiap hari pada 08:23 WIB, dengan retensi 10 versi terbaru. Ini pengaman terhadap salah hapus atau import yang keliru — tetapi berkas ini ikut hilang bila proyek server dihapus, jadi tetap unduh manual ke media lain."
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outlineNavy"
                onClick={() => void handleSaveOnPlatform("full")}
                disabled={backupBusy !== null}
              >
                {backupBusy === "full" ? "Menyimpan…" : <><HardDriveDownload /> Simpan cadangan lengkap</>}
              </Button>
            </div>

            <div className="mt-4 overflow-x-auto">
              {backupHistory === undefined ? (
                <LoadingState label="Memuat riwayat cadangan…" />
              ) : backupHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada cadangan tersimpan. Yang pertama akan dibuat otomatis besok pagi,
                  atau bisa dibuat sekarang lewat tombol di atas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Berkas</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Baris</TableHead>
                      <TableHead>Waktu</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backupHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-[240px] truncate font-mono text-xs">{row.filename}</TableCell>
                        <TableCell>
                          <StatusBadge
                            value={row.trigger === "CRON" ? "APPROVED" : "DRAFT"}
                            label={row.trigger === "CRON" ? "Otomatis" : "Manual"}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.totalRows}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => void handleRestore(row.id)}>
                            <Download /> Buka
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="referensi">
          <SectionCard
            title="Data referensi"
            description="Seed mengisi unit & jabatan dari referensi master data, komponen payroll (tanpa aturan gaji yang dikarang), kompetensi, indikator kinerja, dan pengaturan institusi. Idempotent — aman dijalankan berulang. Data karyawan TIDAK di-seed; masuk lewat Import."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleBootstrap} disabled={saving}>
                <Database /> Jalankan Bootstrap
              </Button>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  seedStatus?.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {seedStatus === undefined ? "Memeriksa…" : seedStatus.ready ? "Referensi lengkap" : "Referensi belum lengkap"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <SeedStat label="Unit" value={seedStatus?.units ?? 0} />
              <SeedStat label="Jabatan" value={seedStatus?.positions ?? 0} />
              <SeedStat label="Komponen payroll" value={seedStatus?.components ?? 0} />
              <SeedStat label="Kompetensi" value={seedStatus?.competencies ?? 0} />
              <SeedStat label="Indikator kinerja" value={seedStatus?.indicators ?? 0} />
              <SeedStat label="Karyawan" value={seedStatus?.employees ?? 0} />
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="pengguna">
          <SectionCard
            title="Pengguna"
            description="Peran menentukan izin secara server-side; perubahan tercatat sebagai PERMISSION_CHANGE di audit log."
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={selfRegistration?.enabled === true}
                    onChange={(event) => void handleToggleSelfRegistration(event.target.checked)}
                  />
                  Izinkan pendaftaran mandiri
                </label>
                <Button onClick={() => setCreateOpen(true)}>
                  <UserPlus className="size-4" /> Tambah pengguna
                </Button>
              </div>
            }
          >
            {users === undefined ? (
              <LoadingState label="Memuat pengguna…" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Peran</TableHead>
                      <TableHead>Terhubung karyawan</TableHead>
                      <TableHead>Login terakhir</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(users as UserRow[]).map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <Select value={user.role} onValueChange={(value) => void handleRoleChange(user.id, value)}>
                            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.values(ROLES).map((role) => (
                                <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {user.employee ? (
                            <div className="flex items-center gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">
                                  {user.employee.namaLengkap}
                                </p>
                                <p className="font-mono text-[11px] text-muted-foreground">
                                  {user.employee.niy}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => void handleLinkEmployee(user.id, "__none")}
                              >
                                Lepas
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={niyDrafts[user.id] ?? ""}
                                onChange={(event) =>
                                  setNiyDrafts((drafts) => ({
                                    ...drafts,
                                    [user.id]: event.target.value,
                                  }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void handleLinkByNiy(user.id);
                                  }
                                }}
                                placeholder="Ketik NIY lalu Enter"
                                className="h-8 w-40 font-mono text-xs"
                              />
                              <Button
                                size="sm"
                                variant="outlineNavy"
                                className="h-8 px-2 text-xs"
                                onClick={() => void handleLinkByNiy(user.id)}
                              >
                                Tautkan
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Belum pernah"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusBadge value={user.active ? "AKTIF" : "TIDAK_AKTIF"} label={user.active ? "Aktif" : "Nonaktif"} />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => void handleResetPassword(user.id)}
                            >
                              Reset sandi
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="peran">
          <SectionCard
            title="Matriks peran & izin"
            description="Sumber kebenaran ada di src/domain/permissions.ts — dipakai bersama oleh UI dan backend."
          >
            {matrix === undefined ? (
              <LoadingState label="Memuat matriks…" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Permission</TableHead>
                      {matrix.roles.map((role) => (
                        <TableHead key={role.role} className="text-center">{role.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrix.permissions.map((permission) => (
                      <TableRow key={permission}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{permission}</TableCell>
                        {matrix.roles.map((role) => (
                          <TableCell key={role.role} className="text-center">
                            {role.permissions.includes(permission) ? (
                              <span className="text-emerald-600">✓</span>
                            ) : (
                              <span className="text-muted-foreground/40">·</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah pengguna</DialogTitle>
            <DialogDescription>
              Akun dibuat langsung oleh Super Admin — pengguna tidak perlu mendaftar sendiri. Setelah
              masuk, akun ini memakai kata sandi di bawah; bila “wajibkan ganti kata sandi” aktif,
              pengguna harus menggantinya sebelum dapat menjelajah aplikasi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-user-name">Nama lengkap</Label>
                <Input
                  id="new-user-name"
                  value={newUser.name}
                  onChange={(event) =>
                    setNewUser((state) => ({ ...state, name: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-user-email">Email</Label>
                <Input
                  id="new-user-email"
                  type="email"
                  value={newUser.email}
                  onChange={(event) =>
                    setNewUser((state) => ({ ...state, email: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-user-role">Peran</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value) => setNewUser((state) => ({ ...state, role: value }))}
                >
                  <SelectTrigger id="new-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ROLES).map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-user-niy">NIY (opsional)</Label>
                <Input
                  id="new-user-niy"
                  value={newUser.niy}
                  onChange={(event) =>
                    setNewUser((state) => ({ ...state, niy: event.target.value }))
                  }
                  placeholder="Kosongkan bila belum ada di Master Data"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-user-password">Kata sandi</Label>
              <Input
                id="new-user-password"
                type="text"
                value={newUser.password}
                onChange={(event) =>
                  setNewUser((state) => ({ ...state, password: event.target.value }))
                }
                placeholder="Minimal 8 karakter"
                minLength={8}
                required
              />
              <p className="text-xs text-muted-foreground">
                Sampaikan lewat kanal pribadi. Password hanya disimpan dalam bentuk hash.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={newUser.mustChangePassword}
                onChange={(event) =>
                  setNewUser((state) => ({ ...state, mustChangePassword: event.target.checked }))
                }
              />
              <span>Wajibkan pengguna mengganti kata sandi setelah login pertama</span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outlineNavy" onClick={() => setCreateOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Menyimpan…" : "Buat pengguna"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="mt-4 p-4 text-xs text-muted-foreground">
        Keamanan berlapis: navigasi & tombol menyembunyikan aksi di luar izin, tetapi setiap query/mutation Convex
        tetap memeriksa permission secara server-side — UI hanyalah lapisan pertama.
      </Card>
    </>
  );
}

function SeedStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function AttendanceSettingsForm({
  initial,
  onSave,
  saving,
}: {
  initial: { workStart: string; workEnd: string; lateThreshold: number };
  onSave: (form: { workStart: string; workEnd: string; lateThreshold: number }) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = React.useState(initial);
  React.useEffect(() => setForm(initial), [initial]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Mulai</Label>
          <Input type="time" value={form.workStart} onChange={(event) => setForm((f) => ({ ...f, workStart: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Selesai</Label>
          <Input type="time" value={form.workEnd} onChange={(event) => setForm((f) => ({ ...f, workEnd: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Toleransi (mnt)</Label>
          <Input type="number" value={form.lateThreshold} onChange={(event) => setForm((f) => ({ ...f, lateThreshold: Number(event.target.value) }))} />
        </div>
      </div>
      <Button onClick={() => void onSave(form)} disabled={saving}>Simpan Jam Kerja</Button>
    </div>
  );
}
