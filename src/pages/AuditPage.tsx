/**
 * Audit Log — who did what, when, to which record. Sensitive values are
 * redacted by the domain diff before they ever reach this table.
 */

import * as React from "react";
import { useQuery } from "convex/react";
import { ChevronDown, History, Search } from "lucide-react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { Pagination, SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, LoadingState } from "@/components/hris/states";
import { Card } from "@/components/ui/card";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/overlays";
import { useDebouncedValue } from "@/lib/hooks";
import { formatDateTime, formatTimeAgo } from "@/lib/format";

interface AuditRow {
  id: string;
  action: string;
  actionLabel: string;
  entity: string;
  recordId?: string;
  summary: string;
  actorName: string;
  actorEmail?: string;
  changes: { field: string; from?: string; to?: string }[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

const ACTION_TONE: Record<string, string> = {
  CREATE: "APPROVED",
  UPDATE: "IN_CLEARANCE",
  DELETE: "REJECTED",
  DEACTIVATE: "PENDING",
  REACTIVATE: "APPROVED",
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  IMPORT: "INFO",
  EXPORT: "INFO",
  VIEW_SENSITIVE: "PENDING",
  LOGIN: "INFO",
  LOGOUT: "INFO",
  UPLOAD: "INFO",
  DOWNLOAD: "INFO",
  PERMISSION_CHANGE: "PENDING",
};

export default function AuditPage() {
  const [action, setAction] = React.useState("all");
  const [entity, setEntity] = React.useState("all");
  const [actorId, setActorId] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebouncedValue(search, 250);

  const facets = useQuery(api.audit.facets, {});
  const result = useQuery(api.audit.list, {
    action: action === "all" ? undefined : action,
    entity: entity === "all" ? undefined : entity,
    actorId: actorId === "all" ? undefined : (actorId as never),
    search: debouncedSearch || undefined,
    page,
    pageSize: 25,
  });

  React.useEffect(() => {
    setPage(1);
  }, [action, entity, actorId, debouncedSearch]);

  const rows = (result?.data ?? []) as AuditRow[];
  const totalActions = facets?.actions.reduce((sum, item) => sum + item.count, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Jejak lengkap aktivitas HRIS: siapa, kapan, aksi, entity, record, dan perubahan penting. Nilai sensitif (NIK, BPJS, rekening) disamarkan sebelum masuk log."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Audit Log" }]}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Entri" value={totalActions} icon={History} />
        <KpiCard label="Jenis Aksi" value={facets?.actions.length ?? 0} icon={History} tone="sky" />
        <KpiCard label="Entity Terlacak" value={facets?.entities.length ?? 0} icon={History} tone="emerald" />
        <KpiCard label="Aktor" value={facets?.actors.length ?? 0} icon={History} tone="slate" />
      </div>

      <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari ringkasan, nama aktor, entity…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua aksi</SelectItem>
              {(facets?.actions ?? []).map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label} ({item.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua entity</SelectItem>
              {(facets?.entities ?? []).map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.value} ({item.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actorId} onValueChange={setActorId}>
            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua aktor</SelectItem>
              {(facets?.actors ?? []).map((actor) => (
                <SelectItem key={actor.id} value={actor.id}>{actor.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <SectionCard title="Entri audit" description="Terbaru lebih dulu. Klik baris untuk melihat detail perubahan.">
        {result === undefined ? (
          <LoadingState label="Memuat audit…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="Tidak ada entri yang cocok"
            description="Ubah filter atau kata kunci pencarian."
            className="border-0"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Aksi</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Ringkasan</TableHead>
                    <TableHead>Aktor</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="group">
                      <TableCell className="whitespace-nowrap">
                        <p className="text-sm">{formatDateTime(row.createdAt)}</p>
                        <p className="text-xs text-muted-foreground">{formatTimeAgo(row.createdAt)}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          value={ACTION_TONE[row.action] ?? "DRAFT"}
                          label={row.actionLabel}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {row.entity}
                      </TableCell>
                      <TableCell className="max-w-[420px]">
                        <p className="text-sm">{row.summary}</p>
                        {row.changes && row.changes.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-primary">
                              {row.changes.length} field berubah
                            </summary>
                            <ul className="mt-1 space-y-0.5">
                              {row.changes.map((change) => (
                                <li key={change.field} className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{change.field}</span>
                                  {change.from !== undefined && change.to !== undefined && (
                                    <>: {change.from} → {change.to}</>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {row.metadata && Object.keys(row.metadata).length > 0 && (
                          <details className="mt-1">
                            <summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                              <ChevronDown className="size-3" /> metadata
                            </summary>
                            <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted/50 p-2 text-[10px] leading-relaxed">
                              {JSON.stringify(row.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{row.actorName}</p>
                        {row.actorEmail && <p className="text-xs text-muted-foreground">{row.actorEmail}</p>}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </SectionCard>
    </>
  );
}
