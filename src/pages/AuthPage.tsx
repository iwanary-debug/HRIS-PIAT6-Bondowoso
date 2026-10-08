import * as React from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/overlays";
import { useAuth } from "@/providers/AuthProvider";
import { describeError } from "@/components/hris/states";

export default function AuthPage() {
  const { login, register, status } = useAuth();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/app";
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const info = useQuery(api.auth.instanceInfo, {});
  const isFirstRun = info?.bootstrapped === false;

  React.useEffect(() => {
    if (isFirstRun) setMode("register");
  }, [isFirstRun]);

  // Public sign-up can be closed by the Super Admin; accounts are then issued
  // from Settings instead of self-registered at this screen.
  React.useEffect(() => {
    if (info && !info.bootstrapped && !info.selfRegistrationOpen) setMode("login");
  }, [info]);

  if (info && !info.bootstrapped && !info.selfRegistrationOpen && mode === "register") {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-xl border border-border bg-card p-6 text-sm">
        <p className="font-semibold text-foreground">Pendaftaran mandiri ditutup</p>
        <p className="text-muted-foreground">
          Akun pada HRIS PIAT6 dibuat oleh Super Admin. Hubungi admin untuk memperoleh akun Anda.
        </p>
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Kembali ke halaman masuk
        </button>
      </div>
    );
  }

  if (status === "authenticated") return <Navigate to={returnTo} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (password.length < 8) {
          throw new Error("PASSWORD_TOO_SHORT");
        }
        await register(name, email, password);
        await login(email, password);
        toast.success("Akun Super Admin berhasil dibuat");
      }
    } catch (err) {
      const described = describeError(err);
      setError(`${described.title}: ${described.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      {/* Form panel */}
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Kembali ke beranda
        </Link>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-navy-900 text-base font-extrabold text-white">
              H6
            </div>
            <div>
              <p className="text-base font-bold leading-tight text-navy-900">HRIS PIAT6 Bondowoso</p>
              <p className="text-xs text-muted-foreground">
                {info?.institutionName ?? "Pesantren Islam Al Irsyad Tengaran 6 Bondowoso"}
              </p>
            </div>
          </div>

          <Badge variant={isFirstRun ? "warning" : "info"} className="w-fit">
            {isFirstRun ? (
              <>
                <ShieldCheck className="size-3" /> Instalasi baru — buat akun Super Admin
              </>
            ) : mode === "login" ? (
              "Masuk ke sistem"
            ) : (
              "Buat akun baru"
            )}
          </Badge>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-900">
            {mode === "login"
              ? "Selamat datang kembali"
              : isFirstRun
                ? "Buat akun Super Admin"
                : "Buat akun karyawan"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login"
              ? "Gunakan email dan kata sandi yang terdaftar pada HRD PIAT 6."
              : isFirstRun
                ? "Akun pertama yang dibuat otomatis berperan sebagai Super Admin dengan seluruh izin sistem."
                : "Akun baru berperan sebagai Karyawan dan hanya dapat melihat data miliknya sendiri melalui Portal Karyawan. HRD dapat menaikkan peran Anda nanti."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nama lengkap</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={isFirstRun ? "Nama_admin_hrd" : "Nama lengkap Anda"}
                  required
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nama@piat6.sch.id"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Kata sandi</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "Minimal 8 karakter" : "••••••••"}
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "login" ? (
                <>
                  <LogIn className="size-4" /> Masuk
                </>
              ) : (
                <>
                  <KeyRound className="size-4" /> Buat akun & masuk
                </>
              )}
            </Button>
          </form>

          {!isFirstRun && info?.selfRegistrationOpen !== false && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? "Belum punya akun? " : "Sudah punya akun? "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {mode === "login" ? "Daftar akun baru" : "Masuk saja"}
              </button>
            </p>
          )}

          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            Data pribadi karyawan produksi tidak pernah disimpan di repository. Master
            karyawan asli diimpor melalui menu <span className="font-medium">Import Data</span>{" "}
            di dalam aplikasi ini.
          </p>
        </div>
      </div>

      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-navy-900 text-white lg:block">
        <div className="surface-grid absolute inset-0 opacity-[0.18]" />
        <div className="absolute -right-24 top-10 size-96 rounded-full bg-navy-500/25 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-300">
              Human Resources Information System
            </p>
            <h2 className="mt-4 max-w-md text-3xl font-bold leading-tight">
              Delapan belas domain HR dalam satu ruang kerja yang aman.
            </h2>
            <ul className="mt-10 space-y-4">
              {[
                "Master karyawan terpusat dengan NIY sebagai identitas bisnis",
                "Import XLSX/CSV dengan validasi dan deteksi duplikat berlapis",
                "Kontrak, kehadiran, cuti, payroll, dan benefit terpaut ke employee master",
                "Audit trail untuk setiap perubahan penting",
                "Otorisasi dijalankan di server, bukan sekadar menyembunyikan tombol",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-navy-100/90">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-navy-300" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-sm font-semibold">Pesantren Islam Al Irsyad Tengaran 6</p>
            <p className="mt-1 text-xs text-navy-200">
              Bondowoso, Jawa Timur · Dibangun sebagai modul HRD PIAT 6 Super App
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
