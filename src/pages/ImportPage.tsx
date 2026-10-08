/**
 * Import Karyawan — the priority workflow.
 * UPLOAD → PARSE → MAPPING → VALIDATION → PREVIEW → DUPLICATE CHECK →
 * CONFIRM → IMPORT → RESULT (+ downloadable error report).
 *
 * The browser parses XLSX/CSV for instant feedback; the server re-runs the
 * whole validation pipeline before writing anything.
 */

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wrench,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { SectionCard, StatusBadge } from "@/components/hris/Primitives";
import { LoadingState, describeError } from "@/components/hris/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/input";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/overlays";
import { downloadBlob } from "@/lib/exporters";
import { formatDate, formatDateTime } from "@/lib/format";
import { SOURCE_COLUMNS } from "@/domain/import/columns";
import { suggestMapping, type ColumnMapping } from "@/domain/import/mapping";
import { isBlankRow, sanitizeRowsForConvex } from "@/domain/import/normalize";
import { buildPreview, type MappingSuggestion } from "@/domain/import/mapping";
import {
  applyDuplicateRule,
  describeEmptyRows,
  summarize,
  summarizeIssues,
  type DuplicateRule,
  type ValidatedRow,
} from "@/domain/import/validate";

interface ParseResult {
  filename: string;
  sheet: string | undefined;
  sheets: string[];
  headerRowIndex: number;
  headerRow: unknown[];
  rows: unknown[][];
}

type Stage = "UPLOAD" | "MAPPING" | "PREVIEW" | "RESULT";

const CONFIDENCE_BADGE: Record<MappingSuggestion["confidence"], { variant: "default" | "info" | "muted"; label: string }> = {
  AUTO: { variant: "default", label: "Otomatis" },
  FUZZY: { variant: "info", label: "Perkiraan" },
  UNMATCHED: { variant: "muted", label: "Tidak dipetakan" },
};

export default function ImportPage() {
  const [stage, setStage] = React.useState<Stage>("UPLOAD");
  const [parsed, setParsed] = React.useState<ParseResult | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [duplicateRule, setDuplicateRule] = React.useState<DuplicateRule>("SKIP");
  const [preview, setPreview] = React.useState<ValidatedRow[] | null>(null);
  const [existingNiy, setExistingNiy] = React.useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [commitResult, setCommitResult] = React.useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);
  const [committedSessionId, setCommittedSessionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showEmptyRows, setShowEmptyRows] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const existingQuery = useQuery(api.importEmployees.existingNiy, {});
  const sessions = useQuery(api.importEmployees.sessions, {});
  const placement = useQuery(api.importEmployees.placementGaps, {});

  React.useEffect(() => {
    if (existingQuery) {
      setExistingNiy(new Set(existingQuery.map((row) => row.niy.toLowerCase())));
    }
  }, [existingQuery]);

  const reset = () => {
    setStage("UPLOAD");
    setParsed(null);
    setMapping({});
    setPreview(null);
    setCommitResult(null);
    setCommittedSessionId(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes("master")) ?? workbook.SheetNames[0];
      if (!sheetName) throw new Error("File tidak memiliki sheet apa pun.");
      const sheet = workbook.Sheets[sheetName]!;
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });

      // Find the header row: the first row that contains both NIY-like and
      // name-like cells (or simply the first row with >= 3 non-empty cells).
      let headerRowIndex = matrix.findIndex(
        (row) => row.filter((cell) => String(cell ?? "").trim() !== "").length >= 3,
      );
      if (headerRowIndex < 0) headerRowIndex = 0;
      const headerRow = matrix[headerRowIndex] ?? [];
      const dataRows = matrix.slice(headerRowIndex + 1).filter((row) => !isBlankRow(row));

      const suggestions = suggestMapping(headerRow);
      const nextMapping: ColumnMapping = {};
      for (const suggestion of suggestions) {
        nextMapping[String(suggestion.headerIndex)] = suggestion.column;
      }
      setParsed({
        filename: file.name,
        sheet: sheetName,
        sheets: workbook.SheetNames,
        headerRowIndex,
        headerRow,
        // XLSX yields real `Date` cells; Convex cannot transport those, so the
        // whole sheet is reduced to primitives (dates -> "yyyy-mm-dd") once,
        // here, and the same values feed the local preview and the server.
        rows: sanitizeRowsForConvex(dataRows),
      });
      setMapping(nextMapping);
      setStage("MAPPING");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membaca file.");
    } finally {
      setBusy(false);
    }
  };

  const buildLocalPreview = React.useCallback(() => {
    if (!parsed) return;
    const rows = buildPreview({
      rows: parsed.rows,
      mapping,
      existingNiy,
    });
    setPreview(applyDuplicateRule(rows, duplicateRule));
  }, [parsed, mapping, existingNiy, duplicateRule]);

  React.useEffect(() => {
    if (stage === "MAPPING" || stage === "PREVIEW") buildLocalPreview();
  }, [stage, buildLocalPreview]);

  const summary = preview ? summarize(preview) : null;
  const issueBreakdown = React.useMemo(
    () => (preview ? summarizeIssues(preview) : []),
    [preview],
  );
  const emptyRows = React.useMemo(
    () => (preview ? describeEmptyRows(preview) : null),
    [preview],
  );

  const createPreviewMutation = useMutation(api.importEmployees.createPreview);
  const commitMutation = useMutation(api.importEmployees.commit);
  const backfillMutation = useMutation(api.importEmployees.backfillAssignments);
  const [repairing, setRepairing] = React.useState(false);

  /**
   * Karyawan yang diimpor sebelum Data Referensi terisi berakhir tanpa
   * bidang/jabatan. Perbaikan ini membaca kembali baris master data yang
   * pernah disetujui operator — tidak menebak data.
   */
  const repairPlacement = async () => {
    setRepairing(true);
    try {
      const report = await backfillMutation({});
      toast.success(`${report.updated} karyawan dilengkapi penempatannya`, {
        description: `${report.bidangFilled} bidang · ${report.jabatanFilled} jabatan · ${report.untraceable} karyawan tidak memiliki sumber data`,
      });
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setRepairing(false);
    }
  };

  const sendCreatePreview = async () => {
    if (!parsed) return null;
    return createPreviewMutation({
      filename: parsed.filename,
      sheet: parsed.sheet,
      headerRowIndex: parsed.headerRowIndex,
      mapping,
      rows: parsed.rows,
      duplicateRule,
    });
  };

  const createServerPreview = async () => {
    if (!parsed || !preview) return;
    setBusy(true);
    setError(null);
    try {
      await sendCreatePreview();
      setStage("PREVIEW");
    } catch (err) {
      const described = describeError(err);
      setError(described.message);
      toast.error(described.title, { description: described.message });
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async () => {
    if (!preview || !summary) return;
    const blocking = preview.filter((row) => row.action === "ERROR").length;
    if (blocking > 0) {
      toast.error("Masih ada baris error", {
        description: `${blocking} baris tidak dapat diimpor. Perbaiki file atau hapus baris bermasalah sebelum melanjutkan.`,
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await sendCreatePreview();
      if (!created) return;
      const result = await commitMutation({ sessionId: created.sessionId });
      setCommitResult(result);
      setCommittedSessionId(created.sessionId);
      setStage("RESULT");
      toast.success("Import selesai", {
        description: `${result.created} baru · ${result.updated} diperbarui · ${result.skipped} dilewati · ${result.errors} error`,
      });
    } catch (err) {
      const described = describeError(err);
      setError(described.message);
      toast.error(described.title, { description: described.message });
    } finally {
      setBusy(false);
    }
  };

  const downloadErrorReport = async () => {
    if (!committedSessionId || !errorReportQuery) return;
    downloadBlob(errorReportQuery.content, errorReportQuery.filename, "text/csv;charset=utf-8");
  };

  const errorReportQuery = useQuery(
    api.importEmployees.errorReport,
    committedSessionId ? { sessionId: committedSessionId as never } : "skip",
  );

  const downloadSample = async () => {
    try {
      const response = await fetch("/sample-data/employees.csv");
      if (!response.ok) throw new Error("Sample tidak tersedia.");
      const text = await response.text();
      downloadBlob(text, "sample-data-employees.csv", "text/csv;charset=utf-8");
    } catch {
      toast.error("Sample data tidak dapat diunduh.");
    }
  };

  return (
    <>
      <PageHeader
        title="Import Data Karyawan"
        description="Alur prioritas HRIS PIAT6: unggah Master data karyawan (XLSX/CSV), petakan kolom otomatis, periksa validasi & duplikat, lalu konfirmasi. NIY adalah identifier unik — data yang sudah ada tidak pernah tertimpa diam-diam."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Import Data" }]}
        actions={
          <>
            <Button variant="outlineNavy" onClick={downloadSample}>
              <Download /> Unduh contoh CSV
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RefreshCw /> Mulai ulang
            </Button>
          </>
        }
      />

      {/* Stepper */}
      <ol className="mb-5 flex flex-wrap items-center gap-2 text-xs font-medium">
        {(["UPLOAD", "MAPPING", "PREVIEW", "RESULT"] as Stage[]).map((item, index) => {
          const order = ["UPLOAD", "MAPPING", "PREVIEW", "RESULT"];
          const activeIndex = order.indexOf(stage);
          const done = index < activeIndex;
          const active = item === stage;
          return (
            <li key={item} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-border bg-muted/40 text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="size-3.5" /> : <span className="tabular-nums">{index + 1}</span>}
                {item === "UPLOAD" ? "Unggah" : item === "MAPPING" ? "Pemetaan" : item === "PREVIEW" ? "Pratinjau" : "Hasil"}
              </span>
              {index < 3 && <ArrowRight className="size-3 text-muted-foreground" />}
            </li>
          );
        })}
      </ol>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50/60 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-red-900">
            <AlertTriangle className="size-4" /> {error}
          </p>
        </Card>
      )}

      {placement && placement.recoverable > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">
                  {placement.recoverable} karyawan belum punya bidang/jabatan
                </p>
                <p className="mt-0.5 text-amber-800">
                  Data Referensi sudah terisi, tetapi penempatan karyawan yang diimpor sebelumnya belum
                  diperbarui. Data diambil kembali dari baris master data yang pernah disetujui.
                </p>
              </div>
            </div>
            <Button variant="outlineNavy" onClick={repairPlacement} disabled={repairing}>
              {repairing ? <RefreshCw className="animate-spin" /> : <Wrench />} Perbaiki penempatan
            </Button>
          </div>
        </Card>
      )}

      {stage === "UPLOAD" && (
        <Card
          className="flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-4 border-2 border-dashed p-10 text-center transition hover:border-primary/50 hover:bg-primary/[0.02]"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <span className="grid size-14 place-items-center rounded-2xl bg-navy-50 text-navy-700">
            {busy ? <RefreshCw className="size-7 animate-spin" /> : <FileUp className="size-7" />}
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              {busy ? "Membaca file…" : "Tarik file ke sini atau klik untuk memilih"}
            </p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Format XLSX, XLS, atau CSV. Sheet <em>Data Master Karyawan</em> dipilih otomatis bila ada. Baris kosong
              di bawah data diabaikan.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3.5" /> Validasi dijalankan ulang di server sebelum penulisan
          </Badge>
        </Card>
      )}

      {stage === "MAPPING" && parsed && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <SectionCard
            title="Pemetaan kolom"
            description={`File ${parsed.filename}${parsed.sheet ? ` · sheet ${parsed.sheet}` : ""} · ${parsed.rows.length} baris data terbaca (header pada baris ${parsed.headerRowIndex + 1}).`}
            actions={
              <Button onClick={createServerPreview} disabled={busy}>
                Lanjut ke pratinjau <ArrowRight />
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kolom file</TableHead>
                    <TableHead>Pemetaan</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(mapping).map(([headerIndex, column]) => {
                    const rawHeader = parsed.headerRow[Number(headerIndex)];
                    const suggestion = suggestMapping(parsed.headerRow).find((s) => s.headerIndex === Number(headerIndex));
                    const badge = CONFIDENCE_BADGE[suggestion?.confidence ?? "UNMATCHED"];
                    return (
                      <TableRow key={headerIndex}>
                        <TableCell className="max-w-[220px] truncate font-medium">{String(rawHeader ?? `Kolom ${Number(headerIndex) + 1}`)}</TableCell>
                        <TableCell>
                          <Select
                            value={column ?? "__none"}
                            onValueChange={(value) =>
                              setMapping((current) => ({
                                ...current,
                                [headerIndex]: value === "__none" ? null : (value as (typeof SOURCE_COLUMNS)[number]["key"]),
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-56 text-xs">
                              <SelectValue placeholder="Abaikan kolom ini" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">— Abaikan —</SelectItem>
                              {SOURCE_COLUMNS.map((sourceColumn) => (
                                <SelectItem key={sourceColumn.key} value={sourceColumn.key}>
                                  {sourceColumn.label}
                                  {sourceColumn.required ? " *" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <SectionCard
            title="Aturan duplikat (NIY sudah terdaftar)"
            description="Berlaku untuk baris yang NIY-nya sudah ada di database. Duplikat di dalam file selalu menjadi error."
          >
            <div className="space-y-3">
              {(
                [
                  { value: "UPDATE", label: "Update", description: "Baris file menimpa data lama untuk kolom yang terisi." },
                  { value: "SKIP", label: "Skip", description: "Data lama dibiarkan — baris dilewati dan dilaporkan." },
                  { value: "ERROR", label: "Error", description: "Import berhenti untuk baris ini sampai NIY diperbaiki." },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                    duplicateRule === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="duplicateRule"
                    className="mt-1 accent-[var(--primary)]"
                    checked={duplicateRule === option.value}
                    onChange={() => setDuplicateRule(option.value)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {summary && (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-4 text-sm">
                <SummaryChip label="Valid" value={summary.valid} tone="text-emerald-700" />
                <SummaryChip label="Warning" value={summary.warnings} tone="text-amber-700" />
                <SummaryChip label="Error" value={summary.errors} tone="text-red-700" />
                <SummaryChip label="Duplikat" value={summary.duplicates} tone="text-sky-700" />
                <SummaryChip label="Baru" value={summary.newRecords} tone="text-foreground" />
                <SummaryChip label="Update" value={summary.updatedRecords} tone="text-foreground" />
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {stage === "PREVIEW" && preview && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <SummaryCard label="Total baris" value={summary.totalRows} />
            <SummaryCard label="Valid" value={summary.valid} tone="emerald" />
            <SummaryCard label="Warning" value={summary.warnings} tone="amber" />
            <SummaryCard label="Error" value={summary.errors} tone="red" />
            <SummaryCard label="Duplikat" value={summary.duplicates} tone="sky" />
            <SummaryCard label="Baris kosong" value={summary.emptyRows} />
            <SummaryCard label="Baru" value={summary.newRecords} />
            <SummaryCard label="Update/Skip" value={summary.updatedRecords + summary.skippedRecords} />
          </div>          {emptyRows && emptyRows.count > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
              <p className="font-semibold">
                {emptyRows.count} baris dilewati — tidak memuat NIY maupun Nama Lengkap.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-sky-800/90">
                Baris seperti ini biasanya bukan data karyawan (mis. baris total, judul seksi, atau
                catatan kaki) sehingga tidak dihitung sebagai error dan tidak di-import. Kalau ternyata
                data karyawan Anda hilang, berarti pemetaan kolomnya belum tepat.
              </p>
              <p className="mt-2 text-xs text-sky-900/80">
                Contoh baris {emptyRows.exampleRowNumber}:{" "}
                <span className="font-mono">{emptyRows.exampleCells}</span>
              </p>
            </div>
          )}

          {issueBreakdown.length > 0 && (
            <SectionCard
              title="Rincian catatan validasi"
              description="Mengapa baris dihitung sebagai Warning atau Error — diurutkan dari yang paling sering muncul."
            >
              <ul className="space-y-2">
                {issueBreakdown.map((item) => (
                  <li
                    key={`${item.severity}-${item.column ?? "-"}`}
                    className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <span
                      className={
                        item.severity === "ERROR"
                          ? "w-20 shrink-0 text-xs font-semibold text-red-700"
                          : item.severity === "WARNING"
                            ? "w-20 shrink-0 text-xs font-semibold text-amber-700"
                            : "w-20 shrink-0 text-xs font-semibold text-muted-foreground"
                      }
                    >
                      {item.severity === "INFO" ? "Info" : item.severity === "ERROR" ? "Error" : "Warning"}
                    </span>
                    <span className="w-44 shrink-0 text-xs font-medium text-foreground">{item.label}</span>
                    <span className="flex-1 text-xs text-muted-foreground">{item.example}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {item.count} baris · mulai baris {item.firstRowNumber}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <SectionCard
            title="Pratinjau validasi"
            description="Server telah memvalidasi ulang seluruh baris terhadap database saat ini. Baris ERROR tidak akan ditulis."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {summary.emptyRows > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setShowEmptyRows((value) => !value)}
                  >
                    {showEmptyRows ? "Sembunyikan" : "Tampilkan"} baris kosong ({summary.emptyRows})
                  </Button>
                )}
                <Button variant="outlineNavy" onClick={() => setStage("MAPPING")}>
                  Kembali
                </Button>
                <Button onClick={commitImport} disabled={busy || summary.errors > 0}>
                  <Upload /> {summary.errors > 0 ? `Perbaiki ${summary.errors} error` : "Konfirmasi Import"}
                </Button>
              </div>
            }
          >
            <div className="max-h-[520px] overflow-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Baris</TableHead>
                    <TableHead>NIY</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Aksi</TableHead>
                    <TableHead>Catatan validasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview
                    .filter((row) => showEmptyRows || row.action !== "SKIP_EMPTY")
                    .map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="tabular-nums text-muted-foreground">{row.rowNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{row.niy || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{String(row.values.namaLengkap ?? "—")}</TableCell>
                        <TableCell>
                          <StatusBadge
                            value={row.action === "NEW" ? "APPROVED" : row.action === "UPDATE" ? "IN_CLEARANCE" : row.action === "SKIP" || row.action === "SKIP_EMPTY" ? "DRAFT" : "REJECTED"}
                            label={row.action ?? "—"}
                          />
                        </TableCell>
                        <TableCell className="max-w-[420px]">
                          {row.issues.length === 0 ? (
                            <span className="text-xs text-muted-foreground">OK</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {row.issues.slice(0, 3).map((issue, index) => (
                                <li
                                  key={index}
                                  className={`text-xs ${
                                    issue.severity === "ERROR"
                                      ? "text-red-700"
                                      : issue.severity === "WARNING"
                                        ? "text-amber-700"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  • {issue.message}
                                </li>
                              ))}
                              {row.issues.length > 3 && (
                                <li className="text-xs text-muted-foreground">+{row.issues.length - 3} catatan lain</li>
                              )}
                            </ul>
                          )}
                          {row.duplicate && (
                            <p className="mt-1 text-xs text-sky-800">
                              Duplikat ({row.duplicate.source === "IN_FILE" ? "di dalam file" : "sudah di database"})
                              {row.duplicate.existingName ? ` · ${row.duplicate.existingName}` : ""}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      )}

      {stage === "RESULT" && commitResult && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="size-7" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Import selesai</h2>
                  <p className="text-sm text-muted-foreground">
                    Seluruh baris tervalidasi ditulis oleh server; setiap perubahan tercatat di audit log.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {commitResult.errors + commitResult.skipped > 0 && (
                  <Button variant="outlineNavy" onClick={downloadErrorReport}>
                    <Download /> Error Report
                  </Button>
                )}
                <Button onClick={reset}>
                  <FileSpreadsheet /> Import lain
                </Button>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SummaryCard label="Total" value={commitResult.total} />
              <SummaryCard label="Baru" value={commitResult.created} tone="emerald" />
              <SummaryCard label="Diperbarui" value={commitResult.updated} tone="sky" />
              <SummaryCard label="Dilewati" value={commitResult.skipped} tone="amber" />
              <SummaryCard label="Error" value={commitResult.errors} tone="red" />
            </div>
          </Card>

          <SectionCard title="Riwayat import" description="20 sesi import terakhir beserta ringkasannya.">
            {sessions === undefined ? (
              <LoadingState label="Memuat riwayat…" />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada sesi import.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aturan duplikat</TableHead>
                      <TableHead>Ringkasan</TableHead>
                      <TableHead>Waktu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => {
                      const summaryNow = session.summary as { created?: number; updated?: number; errors?: number } | null;
                      return (
                        <TableRow key={session.id}>
                          <TableCell className="max-w-[220px] truncate font-medium">{session.filename}</TableCell>
                          <TableCell>
                            <StatusBadge value={session.status === "COMPLETED" ? "APPROVED" : "DRAFT"} label={session.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{session.duplicateRule}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {summaryNow?.created !== undefined
                              ? `${summaryNow.created ?? 0} baru · ${summaryNow.updated ?? 0} update · ${summaryNow.errors ?? 0} error`
                              : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(session.createdAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {stage === "UPLOAD" && sessions !== undefined && sessions.length > 0 && (
        <SectionCard
          className="mt-4"
          title="Riwayat import"
          description="Sesi sebelumnya — hasil dan error report dapat diunduh kembali."
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Selesai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.slice(0, 5).map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.filename}</TableCell>
                    <TableCell>
                      <StatusBadge value={session.status === "COMPLETED" ? "APPROVED" : "DRAFT"} label={session.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(new Date(session.createdAt).toISOString().slice(0, 10))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{session.completedAt ? formatDateTime(session.completedAt) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone = "navy",
}: {
  label: string;
  value: number;
  tone?: "navy" | "emerald" | "amber" | "red" | "sky";
}) {
  const tones: Record<string, string> = {
    navy: "bg-navy-50 text-navy-800",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    sky: "bg-sky-50 text-sky-700",
  };
  return (
    <Card className={`p-3 ${tones[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <p className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
    </p>
  );
}
