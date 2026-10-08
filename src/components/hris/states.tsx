import * as React from "react";
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Consistent loading state used by every data-backed page. */
export function LoadingState({ label = "Memuat data…" }: { label?: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-full bg-navy-50 text-navy-600">
        <Icon className="size-6" />
      </div>
      <div className="max-w-md space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Error state that also explains *why* the request was refused. */
export function ErrorState({
  title = "Gagal memuat data",
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-full bg-red-100 text-red-700">
        <AlertTriangle className="size-6" />
      </div>
      <div className="max-w-lg space-y-1">
        <p className="font-semibold text-red-900">{title}</p>
        <p className="text-sm text-red-800">{message ?? "Terjadi kesalahan yang tidak terduga."}</p>
      </div>
      {onRetry && (
        <Button variant="outlineNavy" size="sm" onClick={onRetry}>
          <RefreshCw /> Coba lagi
        </Button>
      )}
    </div>
  );
}

/** Turn a Convex error into a human sentence (permissions, validation, auth). */
export function describeError(error: unknown): { title: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "Tidak diketahui");
  if (raw.includes("UNAUTHENTICATED")) {
    return {
      title: "Sesi berakhir",
      message: "Silakan masuk kembali untuk melanjutkan.",
    };
  }
  if (raw.startsWith("FORBIDDEN:")) {
    const permission = raw.split(":")[1] ?? "";
    return {
      title: "Akses ditolak",
      message: `Akun Anda tidak memiliki izin ${permission}. Hubungi Super Admin bila ini keliru.`,
    };
  }
  if (raw.startsWith("INVALID_CREDENTIALS")) {
    return { title: "Gagal masuk", message: "Email atau kata sandi salah." };
  }
  if (raw.includes("REGISTRATION_DITUTUP")) {
    return {
      title: "Pendaftaran mandiri ditutup",
      message: "Akun dibuat oleh Super Admin. Hubungi admin untuk memperoleh akun Anda.",
    };
  }
  if (raw.includes("NIY_TIDAK_DITEMUKAN")) {
    return {
      title: "NIY tidak ditemukan",
      message: "NIY tersebut belum ada di Master Data Karyawan. Import data dulu, atau biarkan kosong.",
    };
  }
  if (raw.includes("NIY_SUDAH_TERTAUT")) {
    return { title: "NIY sudah tertaut", message: raw.split(": ")[1] ?? raw };
  }
  if (raw.includes("EMAIL_TAKEN")) {
    return { title: "Gagal mendaftar", message: "Email tersebut sudah terdaftar." };
  }
  if (raw.includes("PASSWORD_TOO_SHORT")) {
    return { title: "Kata sandi terlalu pendek", message: "Gunakan minimal 8 karakter." };
  }
  if (raw.startsWith("DELETE_BLOCKED")) {
    return {
      title: "Penghapusan permanen diblokir",
      message: raw.split(": ")[1] ?? "Gunakan Deactivate agar histori tetap tersimpan.",
    };
  }
  return { title: "Terjadi kesalahan", message: raw };
}
