import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/input";

/** Card with a consistent section header for dashboard/report panels. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </CardHeader>
      <CardContent className={cn("flex-1", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  AKTIF: "success",
  TIDAK_AKTIF: "muted",
  RESIGN: "warning",
  TERMINASI: "danger",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  DRAFT: "muted",
  CANCELLED: "muted",
  COMPLETED: "success",
  IN_CLEARANCE: "info",
  OPEN: "warning",
  IN_FOLLOW_UP: "info",
  RESOLVED: "success",
  VERIFIED: "success",
  EXPIRED: "danger",
  PAID: "success",
  AMAN: "success",
  MENDEKAT: "info",
  PERLU_TINDAKAN: "warning",
  LEWAT: "danger",
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[value] ?? "secondary"} className="whitespace-nowrap">
      {label ?? value}
    </Badge>
  );
}

export function InfoRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2", className)}>
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-right text-sm font-medium text-foreground",
          mono && "font-mono text-[13px]",
        )}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

/** Server-side pagination control. */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border/70 px-3 py-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Menampilkan <span className="font-semibold text-foreground">{from}</span>–
        <span className="font-semibold text-foreground">{to}</span> dari{" "}
        <span className="font-semibold text-foreground">{total}</span> data
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger className="h-8 w-[104px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">
                  {size} / halaman
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 text-xs font-medium text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small horizontal proportion bar used in dashboard breakdowns. */
export function BarListRow({
  label,
  value,
  max,
  tone = "navy",
  href,
}: {
  label: string;
  value: number;
  max: number;
  tone?: "navy" | "emerald" | "amber" | "red" | "sky";
  href?: string;
}) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  const bar = (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-foreground">{label}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", {
            "bg-navy-700": tone === "navy",
            "bg-emerald-500": tone === "emerald",
            "bg-amber-500": tone === "amber",
            "bg-red-500": tone === "red",
            "bg-sky-500": tone === "sky",
          })}
          style={{ width: `${Math.max(percent, value > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block rounded-md transition hover:opacity-80">
      {bar}
    </a>
  ) : (
    bar
  );
}
