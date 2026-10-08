import { Link } from "react-router-dom";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  tone?: "navy" | "emerald" | "amber" | "red" | "sky" | "slate";
  to?: string;
  loading?: boolean;
}

const TONES = {
  navy: "bg-navy-50 text-navy-700 ring-navy-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
} as const;

export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "navy",
  to,
  loading,
}: KpiCardProps) {
  const content = (
    <Card
      className={cn(
        "group relative overflow-hidden p-5 transition",
        to && "hover:border-navy-200 hover:shadow-[0_8px_30px_-18px_rgba(15,31,63,0.45)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <p className="mt-1.5 text-2xl font-bold leading-none tracking-tight text-foreground">
              {value}
            </p>
          )}
          {hint && !loading && (
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg ring-1", TONES[tone])}>
          <Icon className="size-5" />
        </span>
      </div>
      {to && (
        <ArrowUpRight className="absolute -bottom-1 -right-1 size-16 text-navy-900/[0.04] transition group-hover:text-navy-900/[0.08]" />
      )}
    </Card>
  );

  return to ? (
    <Link to={to} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {content}
    </Link>
  ) : (
    content
  );
}
