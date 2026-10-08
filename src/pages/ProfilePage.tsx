/**
 * Profil — akun pengguna, peran + izin, tautan karyawan, dan ganti kata sandi.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { KeyRound, ShieldCheck, UserCircle2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { SectionCard } from "@/components/hris/Primitives";
import { LoadingState, describeError } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useAuth } from "@/providers/AuthProvider";
import { ROLE_LABELS } from "@/domain/permissions";
import type { Permission } from "@/domain/permissions";

export default function ProfilePage() {
  const { user } = useAuth();
  const profile = useQuery(api.auth.currentProfile, {});
  const [form, setForm] = React.useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = React.useState(false);

  const changePasswordMutation = useMutation(api.auth.changePassword);

  const handleChangePassword = async () => {
    if (form.newPassword.length < 8) {
      toast.error("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (form.newPassword !== form.confirm) {
      toast.error("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setSaving(true);
    try {
      await changePasswordMutation({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success("Kata sandi diperbarui");
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <LoadingState label="Memuat profil…" />;
  }

  return (
    <>
      <PageHeader
        title="Profil Saya"
        description="Informasi akun, peran, dan izin. Izin diperiksa ulang oleh backend pada setiap permintaan."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Profil" }]}
      />

      {profile?.mustChangePassword && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Ganti kata sandi Anda sebelum melanjutkan</p>
          <p className="mt-1 text-xs text-amber-800">
            Akun ini masih memakai kata sandi sementara dari Super Admin. Buat kata sandi baru di
            bawah, lalu Anda baru bisa membuka halaman lain.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Akun" description="Identitas yang dipakai pada audit log.">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-2xl bg-navy-50 text-navy-700">
              <UserCircle2 className="size-9" />
            </span>
            <div>
              <p className="text-lg font-bold text-foreground">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="mt-1 inline-flex rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
          </div>
          {profile?.employee && (
            <p className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              Terhubung ke data karyawan:{" "}
              <Link to={`/app/employees/${profile.employee._id}`} className="font-medium text-primary hover:underline">
                {profile.employee.namaLengkap}
              </Link>{" "}
              <span className="font-mono text-xs text-muted-foreground">({profile.employee.niy})</span>
            </p>
          )}
        </SectionCard>

        <SectionCard title="Ganti kata sandi" description="Minimal 8 karakter.">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kata sandi saat ini</Label>
              <Input
                type="password"
                value={form.currentPassword}
                onChange={(event) => setForm((f) => ({ ...f, currentPassword: event.target.value }))}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kata sandi baru</Label>
              <Input
                type="password"
                value={form.newPassword}
                onChange={(event) => setForm((f) => ({ ...f, newPassword: event.target.value }))}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Konfirmasi kata sandi baru</Label>
              <Input
                type="password"
                value={form.confirm}
                onChange={(event) => setForm((f) => ({ ...f, confirm: event.target.value }))}
                autoComplete="new-password"
              />
            </div>
            <Button onClick={handleChangePassword} disabled={saving}>
              <KeyRound /> Perbarui Kata Sandi
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="Izin akun"
          description="Sumber kebenaran: matriks peran di backend."
          className="lg:col-span-2"
        >
          <div className="flex flex-wrap gap-1.5">
            {user.permissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Akun self-service tanpa izin khusus. Hubungi HRD bila membutuhkan akses tambahan.
              </p>
            ) : (
              user.permissions.map((permission: Permission) => (
                <span
                  key={permission}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-foreground"
                >
                  <ShieldCheck className="size-3.5 text-emerald-600" />
                  {permission}
                </span>
              ))
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {user.permissions.length} dari 24 permission · peran diperbarui oleh Super Admin melalui menu Pengaturan.
          </p>
        </SectionCard>
      </div>
    </>
  );
}
