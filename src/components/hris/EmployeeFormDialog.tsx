import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/overlays";
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { describeError } from "@/components/hris/states";
import { useAuth } from "@/providers/AuthProvider";
import {
  EMPLOYEE_STATUS_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  PENDIDIKAN_TERAKHIR,
  STATUS_AKAD_OPTIONS,
} from "@/domain/employee";
import type { Id } from "../../../convex/_generated/dataModel";

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: Id<"employees">;
  onSaved?: (id: Id<"employees">) => void;
}

const EMPTY = {
  niy: "",
  namaLengkap: "",
  bidangId: "",
  jabatanId: "",
  tanggalLahir: "",
  tempatLahir: "",
  alamatKtp: "",
  nik: "",
  noHp: "",
  email: "",
  tanggalBergabung: "",
  statusAkad: "PKWT",
  durasiKontrak: "",
  jtPerpanjanganKontrak: "",
  status: "AKTIF",
  tmtResign: "",
  bpjsKesehatanNumber: "",
  bank: "",
  noRekening: "",
  statusPernikahan: "",
  jumlahAnak: "0",
  pendidikanTerakhir: "",
  universitas: "",
  jurusan: "",
};

type FormState = typeof EMPTY;

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employeeId,
  onSaved,
}: EmployeeFormDialogProps) {
  const { can } = useAuth();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const existing = useQuery(
    api.employees.get,
    employeeId ? { id: employeeId } : "skip",
  );
  const units = useQuery(api.organization.listUnits, {});
  const positions = useQuery(api.organization.listPositions, {});
  const create = useMutation(api.employeeWrites.create);
  const update = useMutation(api.employeeWrites.update);

  const set = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    if (!employeeId) {
      setForm(EMPTY);
      return;
    }
    if (existing) {
      setForm({
        niy: existing.niy,
        namaLengkap: existing.namaLengkap,
        bidangId: existing.bidangId ?? "",
        jabatanId: existing.jabatanId ?? "",
        tanggalLahir: existing.tanggalLahir ?? "",
        tempatLahir: existing.tempatLahir ?? "",
        alamatKtp: existing.alamatKtp ?? "",
        nik: existing.nik ?? "",
        noHp: existing.noHp ?? "",
        email: existing.email ?? "",
        tanggalBergabung: existing.tanggalBergabung ?? "",
        statusAkad: existing.statusAkad ?? "PKWT",
        durasiKontrak: existing.durasiKontrak ?? "",
        jtPerpanjanganKontrak: existing.jtPerpanjanganKontrak ?? "",
        status: existing.status,
        tmtResign: existing.tmtResign ?? "",
        bpjsKesehatanNumber: existing.bpjsKesehatanNumber ?? "",
        bank: existing.bank ?? "",
        noRekening: existing.noRekening ?? "",
        statusPernikahan: existing.statusPernikahan ?? "",
        jumlahAnak: String(existing.jumlahAnak ?? 0),
        pendidikanTerakhir: existing.pendidikanTerakhir ?? "",
        universitas: existing.universitas ?? "",
        jurusan: existing.jurusan ?? "",
      });
    }
  }, [open, employeeId, existing]);

  const canSeeSensitive = can("HR_SENSITIVE_VIEW");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      namaLengkap: form.namaLengkap.trim(),
      bidangId: (form.bidangId || null) as Id<"organizationUnits"> | null,
      jabatanId: (form.jabatanId || null) as Id<"positions"> | null,
      tanggalLahir: form.tanggalLahir || null,
      tempatLahir: form.tempatLahir || null,
      alamatKtp: form.alamatKtp || null,
      nik: form.nik || null,
      noHp: form.noHp || null,
      email: form.email || null,
      tanggalBergabung: form.tanggalBergabung || null,
      statusAkad: form.statusAkad,
      durasiKontrak: form.durasiKontrak || null,
      jtPerpanjanganKontrak: form.jtPerpanjanganKontrak || null,
      status: form.status,
      tmtResign: form.tmtResign || null,
      bpjsKesehatanNumber: form.bpjsKesehatanNumber || null,
      bank: form.bank || null,
      noRekening: form.noRekening || null,
      statusPernikahan: form.statusPernikahan || null,
      jumlahAnak: form.jumlahAnak === "" ? null : Number(form.jumlahAnak),
      pendidikanTerakhir: form.pendidikanTerakhir || null,
      universitas: form.universitas || null,
      jurusan: form.jurusan || null,
    };
    try {
      const result = employeeId
        ? await update({ id: employeeId, niy: form.niy.trim(), ...payload })
        : await create({ niy: form.niy.trim(), ...payload });
      if (!result.ok) {
        const next: Record<string, string> = {};
        for (const error of result.errors) next[error.field] = error.message;
        setErrors(next);
        toast.error("Periksa kembali data yang ditandai");
        return;
      }
      toast.success(employeeId ? "Data karyawan diperbarui" : "Karyawan baru ditambahkan");
      onOpenChange(false);
      if (onSaved) onSaved(result.employeeId);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setBusy(false);
    }
  };

  const err = (key: string) =>
    errors[key] ? <p className="text-xs text-red-600">{errors[key]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-h-[92vh]">
        <DialogHeader>
          <DialogTitle>{employeeId ? "Ubah Data Karyawan" : "Tambah Karyawan"}</DialogTitle>
          <DialogDescription>
            NIY adalah business identifier. Usia dan masa kerja dihitung otomatis dari
            tanggal lahir dan tanggal bergabung.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <Tabs defaultValue="umum">
            <TabsList>
              <TabsTrigger value="umum">Umum</TabsTrigger>
              <TabsTrigger value="kepegawaian">Kepegawaian</TabsTrigger>
              <TabsTrigger value="pribadi">Data Pribadi</TabsTrigger>
              {canSeeSensitive && <TabsTrigger value="sensitif">Sensitif</TabsTrigger>}
              <TabsTrigger value="pendidikan">Pendidikan</TabsTrigger>
            </TabsList>

            <TabsContent value="umum" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="NIY" required error={err("niy")}>
                  <Input value={form.niy} onChange={(e) => set("niy", e.target.value)} required placeholder="SAMPLE-0001" />
                </Field>
                <Field label="Nama Lengkap" required error={err("namaLengkap")}>
                  <Input value={form.namaLengkap} onChange={(e) => set("namaLengkap", e.target.value)} required />
                </Field>
                <Field label="Bidang / Unit">
                  <Select value={form.bidangId || "none"} onValueChange={(v) => set("bidangId", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Pilih bidang" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Tidak ada —</SelectItem>
                      {(units ?? []).map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>{unit.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Jabatan">
                  <Select value={form.jabatanId || "none"} onValueChange={(v) => set("jabatanId", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Pilih jabatan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Tidak ada —</SelectItem>
                      {(positions ?? []).map((position) => (
                        <SelectItem key={position.id} value={position.id}>{position.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status Akad">
                  <Select value={form.statusAkad} onValueChange={(v) => set("statusAkad", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_AKAD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="kepegawaian" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tanggal Bergabung">
                  <Input type="date" value={form.tanggalBergabung} onChange={(e) => set("tanggalBergabung", e.target.value)} />
                </Field>
                <Field label="Durasi Kontrak">
                  <Input value={form.durasiKontrak} onChange={(e) => set("durasiKontrak", e.target.value)} placeholder="1 Tahun" />
                </Field>
                <Field label="Jatuh Tempo Perpanjangan">
                  <Input type="date" value={form.jtPerpanjanganKontrak} onChange={(e) => set("jtPerpanjanganKontrak", e.target.value)} />
                </Field>
                <Field label="TMT Resign" error={err("tmtResign")}>
                  <Input type="date" value={form.tmtResign} onChange={(e) => set("tmtResign", e.target.value)} />
                </Field>
              </div>
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Detail kontrak, SK, dan riwayat perpanjangan dikelola di modul Kontrak &amp; SK.
              </p>
            </TabsContent>

            <TabsContent value="pribadi" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tanggal Lahir" error={err("tanggalLahir")}>
                  <Input type="date" value={form.tanggalLahir} onChange={(e) => set("tanggalLahir", e.target.value)} />
                </Field>
                <Field label="Tempat Lahir">
                  <Input value={form.tempatLahir} onChange={(e) => set("tempatLahir", e.target.value)} />
                </Field>
                <Field label="No HP" error={err("noHp")}>
                  <Input value={form.noHp} onChange={(e) => set("noHp", e.target.value)} placeholder="08xxxxxxxxxx" />
                </Field>
                <Field label="Email" error={err("email")}>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <Field label="Status Pernikahan">
                  <Select value={form.statusPernikahan || "none"} onValueChange={(v) => set("statusPernikahan", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Pilih status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Tidak diisi —</SelectItem>
                      {MARITAL_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Jumlah Anak" error={err("jumlahAnak")}>
                  <Input type="number" min={0} max={20} value={form.jumlahAnak} onChange={(e) => set("jumlahAnak", e.target.value)} />
                </Field>
              </div>
            </TabsContent>

            {canSeeSensitive && (
              <TabsContent value="sensitif" className="space-y-3">
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Data di bawah ini hanya dapat diubah oleh pengguna dengan izin
                  HR_SENSITIVE_VIEW dan setiap akses tercatat pada audit log.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="NIK (16 digit)" error={err("nik")}>
                    <Input value={form.nik} onChange={(e) => set("nik", e.target.value)} maxLength={16} />
                  </Field>
                  <Field label="Alamat KTP (Kab./Kota)">
                    <Input value={form.alamatKtp} onChange={(e) => set("alamatKtp", e.target.value)} />
                  </Field>
                  <Field label="No. BPJS Kesehatan">
                    <Input value={form.bpjsKesehatanNumber} onChange={(e) => set("bpjsKesehatanNumber", e.target.value)} />
                  </Field>
                  <Field label="Bank">
                    <Input value={form.bank} onChange={(e) => set("bank", e.target.value)} placeholder="BSI" />
                  </Field>
                  <Field label="No. Rekening">
                    <Input value={form.noRekening} onChange={(e) => set("noRekening", e.target.value)} />
                  </Field>
                </div>
              </TabsContent>
            )}

            <TabsContent value="pendidikan" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Pendidikan Terakhir">
                  <Select value={form.pendidikanTerakhir || "none"} onValueChange={(v) => set("pendidikanTerakhir", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Pilih jenjang" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Tidak diisi —</SelectItem>
                      {PENDIDIKAN_TERAKHIR.map((level) => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Universitas / Institusi">
                  <Input value={form.universitas} onChange={(e) => set("universitas", e.target.value)} />
                </Field>
                <Field label="Jurusan">
                  <Input value={form.jurusan} onChange={(e) => set("jurusan", e.target.value)} />
                </Field>
              </div>
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Riwayat pendidikan lengkap (termasuk ijazah sebelumnya) dikelola pada modul
                Pendidikan &amp; Kompetensi.
              </p>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {employeeId ? "Simpan Perubahan" : "Tambah Karyawan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error}
    </div>
  );
}
