/**
 * Laporan — report center. Server computes rows (permission checked); the
 * client formats CSV / XLSX / print-to-PDF.
 */

import * as React from "react";
import { useQuery } from "convex/react";
import { FileBarChart2, Printer, FileSpreadsheet, FileText } from "lucide-react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { KpiCard } from "@/components/hris/KpiCard";
import { SectionCard } from "@/components/hris/Primitives";
import { EmptyState, LoadingState } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/providers/AuthProvider";
import { formatDate } from "@/lib/format";
import { downloadCsv, downloadXlsx, printTable, type ExportColumn } from "@/lib/exporters";
import type { Id } from "../../convex/_generated/dataModel";


interface CatalogItem {
  key: string;
  title: string;
  group: string;
  permission: string;
}

const REPORTS_WITH_PERIOD = ["attendance", "leave"];

export default function ReportsPage() {
  const { can } = useAuth();
  const [selected, setSelected] = React.useState("employee-list");
  const [bidangId, setBidangId] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [period, setPeriod] = React.useState(new Date().toISOString().slice(0, 7));

  const units = useQuery(api.organization.listUnits, {});
  const catalog = useQuery(api.reports.reportCatalog, {});
  const result = useQuery(api.reports.run, {
    report: selected,
    bidangId: bidangId === "all" ? undefined : (bidangId as Id<"organizationUnits">),
    status: status === "all" ? undefined : status,
    period: REPORTS_WITH_PERIOD.includes(selected) ? period : undefined,
  });

  const grouped = React.useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of (catalog ?? []) as CatalogItem[]) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [catalog]);

  const columns: ExportColumn[] = (result?.columns ?? []).map((column) => ({ key: column, label: column }));
  const exportRows: Record<string, unknown>[] = (result?.rows ?? []) as Record<string, unknown>[];

  const subtitle = `HRIS PIAT6 Bondowoso · Pesantren Islam Al Irsyad Tengaran 6 Bondowoso · ${formatDate(new Date().toISOString().slice(0, 10))}`;

  const needsReportViewerNote = !can("HR_SENSITIVE_VIEW") && selected === "employee-list";

  return (
    <>
      <PageHeader
        title="Laporan"
        description="Pusat laporan SDM: pilih laporan, terapkan filter, lalu cetak (PDF via dialog browser), ekspor CSV atau XLSX. Laporan daftar karyawan hanya menyertakan kolom sensitif bila akun Anda berizin — dan tetap ter-audit."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Laporan" }]}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Laporan Tersedia" value={catalog?.length ?? 0} icon={FileBarChart2} />
        <KpiCard label="Terpilih" value={result?.title ?? "—"} icon={FileText} tone="sky" />
        <KpiCard label="Baris" value={result?.rows.length ?? 0} icon={FileText} tone="emerald" />
        <KpiCard label="Kolom" value={result?.columns.length ?? 0} icon={FileText} tone="slate" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <SectionCard title="Katalog laporan">
            {catalog === undefined ? (
              <LoadingState label="Memuat katalog…" />
            ) : (
              <div className="space-y-3">
                {grouped.map(([group, items]) => (
                  <div key={group}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelected(item.key)}
                          className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
                            selected === item.key ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted/50"
                          }`}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Filter">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Bidang</label>
                <Select value={bidangId} onValueChange={setBidangId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua bidang</SelectItem>
                    {(units ?? []).map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.nama}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Status karyawan</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    {["AKTIF", "TIDAK_AKTIF", "RESIGN", "TERMINASI"].map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {REPORTS_WITH_PERIOD.includes(selected) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Periode</label>
                  <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-8 text-xs" />
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title={result?.title ?? "Laporan"}
          description={`${result?.rows.length ?? 0} baris · diekspor sesuai izin akun Anda`}
          actions={
            result && result.rows.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outlineNavy" size="sm" onClick={() => printTable(result.title, subtitle, columns, exportRows)}>
                  <Printer /> Cetak / PDF
                </Button>
                <Button variant="outlineNavy" size="sm" onClick={() => downloadCsv(`${selected}-${period}.csv`, columns, exportRows)}>
                  <FileText /> CSV
                </Button>
                <Button variant="outlineNavy" size="sm" onClick={() => downloadXlsx(`${selected}-${period}.xlsx`, result.title, columns, exportRows)}>
                  <FileSpreadsheet /> XLSX
                </Button>
              </div>
            )
          }
        >
          {result === undefined ? (
            <LoadingState label="Menjalankan laporan…" />
          ) : result.rows.length === 0 ? (
            <EmptyState
              title="Tidak ada data"
              description="Ubah filter atau pilih laporan lain. Bila datanya memang kosong, isi melalui Import Data."
              className="border-0"
            />
          ) : (
            <>
              {needsReportViewerNote && (
                <Card className="mb-3 p-3 text-xs text-muted-foreground">
                  Kolom NIK, BPJS, rekening, HP, email, dan alamat tidak disertakan karena akun ini tidak memegang
                  HR_SENSITIVE_VIEW.
                </Card>
              )}
              <div className="max-h-[560px] overflow-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {result.columns.map((column) => (
                        <TableHead key={column}>{column}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportRows.map((row, index) => (
                      <TableRow key={index}>
                        {result.columns.map((column) => (
                          <TableCell key={column} className="whitespace-nowrap">
                            {row[column] === "" || row[column] === undefined ? "—" : String(row[column])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {result.footnotes && result.footnotes.length > 0 && (
                <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                  {result.footnotes.map((note, index) => (
                    <li key={index}>• {note}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SectionCard>
      </div>
    </>
  );
}
