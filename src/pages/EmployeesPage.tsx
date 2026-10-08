import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  UserMinus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/hris/PageHeader";
import { Pagination, StatusBadge } from "@/components/hris/Primitives";
import { EmptyState, LoadingState, describeError } from "@/components/hris/states";
import { EmployeeFormDialog } from "@/components/hris/EmployeeFormDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/overlays";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { useAuth } from "@/providers/AuthProvider";
import { useDebouncedValue } from "@/lib/hooks";
import { formatDate, initialsOf } from "@/lib/format";
import { downloadEmployeesCsv } from "@/lib/exporters";
import { EMPLOYEE_STATUS_OPTIONS, STATUS_AKAD_OPTIONS } from "@/domain/employee";
import type { Id } from "../../convex/_generated/dataModel";

const SORTABLE = [
  { key: "niy", label: "NIY" },
  { key: "namaLengkap", label: "Nama" },
  { key: "bidang", label: "Bidang" },
  { key: "jabatan", label: "Jabatan" },
  { key: "status", label: "Status" },
  { key: "statusAkad", label: "Status Akad" },
  { key: "masaKerja", label: "Masa Kerja" },
] as const;

export default function EmployeesPage() {
  const { can } = useAuth();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [bidangId, setBidangId] = React.useState("all");
  const [jabatanId, setJabatanId] = React.useState("all");
  const [statusAkad, setStatusAkad] = React.useState("all");
  const [includeInactive, setIncludeInactive] = React.useState(true);
  const [sortBy, setSortBy] = React.useState<string>("namaLengkap");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Id<"employees"> | undefined>();
  const [deactivating, setDeactivating] = React.useState<{
    id: Id<"employees">;
    name: string;
    status: string;
  } | null>(null);
  const [showSensitive, setShowSensitive] = React.useState(false);
  const [sensitiveBusy, setSensitiveBusy] = React.useState(false);

  const debouncedSearch = useDebouncedValue(search, 250);
  const setStatusMutation = useMutation(api.employeeWrites.setStatus);
  const reveal = useMutation(api.employees.revealSensitive);
  const exportRows = useMutation(api.employees.exportRows);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, bidangId, jabatanId, statusAkad, includeInactive]);

  const args = {
    search: debouncedSearch || undefined,
    status: status === "all" ? undefined : [status],
    bidangId: bidangId === "all" ? undefined : [bidangId],
    jabatanId: jabatanId === "all" ? undefined : [jabatanId],
    statusAkad: statusAkad === "all" ? undefined : [statusAkad],
    includeInactive,
    page,
    pageSize,
    sortBy,
    sortDir,
  };

  const result = useQuery(api.employees.list, args);
  const facets = useQuery(api.employees.facets, {});
  const units = useQuery(api.organization.listUnits, {});
  const positions = useQuery(api.organization.listPositions, {});
  const sensitive = useQuery(
    api.employees.get,
    showSensitive && result?.data[0] ? { id: result.data[0]._id as Id<"employees"> } : "skip",
  );

  const toggleSort = (key: string) => {
    if (sortBy === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const confirmStatusChange = async () => {
    if (!deactivating) return;
    const next = deactivating.status === "AKTIF" ? "TIDAK_AKTIF" : "AKTIF";
    try {
      await setStatusMutation({ id: deactivating.id, status: next });
      toast.success(next === "AKTIF" ? "Karyawan diaktifkan kembali" : "Karyawan dinonaktifkan");
      setDeactivating(null);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleExport = async () => {
    try {
      const exported = await exportRows({ ...args, page: undefined, pageSize: undefined });
      downloadEmployeesCsv(exported.rows as unknown as Record<string, unknown>[], exported.includeSensitive);
      toast.success(`${exported.rows.length} baris diekspor ke CSV`);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    }
  };

  const handleReveal = async () => {
    if (!result?.data[0]) return;
    setSensitiveBusy(true);
    try {
      const value = await reveal({ id: result.data[0]._id as Id<"employees">, reason: "Pemeriksaan dari daftar karyawan" });
      toast.success("Data sensitif ditampilkan", {
        description: value
          ? `NIK ${value.nik ?? "—"} · BPJS ${value.bpjsKesehatanNumber ?? "—"}`
          : undefined,
      });
      setShowSensitive(true);
    } catch (err) {
      const described = describeError(err);
      toast.error(described.title, { description: described.message });
    } finally {
      setSensitiveBusy(false);
    }
  };

  const hasFilters =
    search || status !== "all" || bidangId !== "all" || jabatanId !== "all" || statusAkad !== "all";

  return (
    <>
      <PageHeader
        title="Data Karyawan"
        description="Master karyawan PIAT 6 Bondowoso. NIK, BPJS, dan nomor rekening tidak ditampilkan pada tabel umum — kolom tersebut hanya terbuka lewat aksi berizin dan tercatat di audit log."
        crumbs={[{ label: "Beranda", to: "/app" }, { label: "Data Karyawan" }]}
        actions={
          <>
            {can("HR_EXPORT") && (
              <Button variant="outlineNavy" onClick={handleExport}>
                <Download /> Ekspor CSV
              </Button>
            )}
            {can("HR_IMPORT") && (
              <Button variant="outlineNavy" asChild>
                <Link to="/app/import">
                  <FileSpreadsheet /> Import
                </Link>
              </Button>
            )}
            {can("HR_CREATE") && (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                <Plus /> Tambah Karyawan
              </Button>
            )}
          </>
        }
      />

      {/* Filters */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari berdasarkan NIY, nama, jabatan, atau unit…"
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select value={bidangId} onValueChange={setBidangId}>
              <SelectTrigger><SelectValue placeholder="Bidang" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua bidang</SelectItem>
                {(units ?? []).map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>{unit.nama} ({unit.jumlahKaryawan})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={jabatanId} onValueChange={setJabatanId}>
              <SelectTrigger><SelectValue placeholder="Jabatan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jabatan</SelectItem>
                {(positions ?? []).map((position) => (
                  <SelectItem key={position.id} value={position.id}>{position.nama}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label} ({facets?.status.find((s) => s.value === option.value)?.jumlah ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusAkad} onValueChange={setStatusAkad}>
              <SelectTrigger><SelectValue placeholder="Status akad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua akad</SelectItem>
                {STATUS_AKAD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="size-4 rounded border-primary text-primary focus:ring-primary"
            />
            Tampilkan karyawan nonaktif
          </label>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setBidangId("all");
                setJabatanId("all");
                setStatusAkad("all");
              }}
            >
              <X /> Bersihkan filter
            </Button>
          )}
          {can("HR_SENSITIVE_VIEW") && (
            <Button variant="ghost" size="sm" onClick={handleReveal} disabled={sensitiveBusy}>
              {showSensitive ? <EyeOff /> : <Eye />}
              {showSensitive ? "Tutup data sensitif" : "Periksa data sensitif"}
            </Button>
          )}
          {showSensitive && sensitive && (
            <span className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              {sensitive.namaLengkap}: NIK {sensitive.nik ?? "—"} · BPJS {sensitive.bpjsKesehatanNumber ?? "—"} ·
              Rekening {sensitive.noRekening ?? "—"}
            </span>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {result === undefined ? (
          <LoadingState label="Memuat data karyawan…" />
        ) : result.data.length === 0 ? (
          <EmptyState
            icon={Filter}
            title={hasFilters ? "Tidak ada karyawan yang cocok" : "Belum ada data karyawan"}
            description={
              hasFilters
                ? "Coba ubah kata kunci atau bersihkan filter yang aktif."
                : "Tambahkan karyawan secara manual atau muat data melalui menu Import Data."
            }
            action={
              hasFilters ? (
                <Button variant="outlineNavy" onClick={() => { setSearch(""); setStatus("all"); setBidangId("all"); setJabatanId("all"); setStatusAkad("all"); }}>
                  Bersihkan filter
                </Button>
              ) : can("HR_IMPORT") ? (
                <Button asChild><Link to="/app/import"><FileSpreadsheet /> Import Data</Link></Button>
              ) : can("HR_CREATE") ? (
                <Button onClick={() => setFormOpen(true)}><Plus /> Tambah Karyawan</Button>
              ) : undefined
            }
            className="border-0"
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {SORTABLE.map((column) => (
                    <TableHead key={column.key}>
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {column.label}
                        {sortBy === column.key ? (
                          sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((employee) => (
                  <TableRow key={employee._id}>
                    <TableCell className="font-mono text-xs">{employee.niy}</TableCell>
                    <TableCell>
                      <Link to={`/app/employees/${employee._id}`} className="flex items-center gap-2.5 hover:text-primary">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy-100 text-[10px] font-semibold text-navy-800">
                          {initialsOf(employee.namaLengkap)}
                        </span>
                        <span className="font-medium">{employee.namaLengkap}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{employee.bidang ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{employee.jabatan ?? "—"}</TableCell>
                    <TableCell><StatusBadge value={employee.status} /></TableCell>
                    <TableCell>
                      {employee.statusAkad ? (
                        <StatusBadge
                          value={employee.statusAkad === "PKWT" ? "DRAFT" : "APPROVED"}
                          label={employee.statusAkad}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {employee.masaKerjaLabel ?? "—"}
                    </TableCell>
                    <TableHead className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal />
                            <span className="sr-only">Aksi</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/app/employees/${employee._id}`}>Buka detail</Link>
                          </DropdownMenuItem>
                          {can("HR_EDIT") && (
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(employee._id as Id<"employees">);
                                setFormOpen(true);
                              }}
                            >
                              Ubah data
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {can("HR_EDIT") && (
                            <DropdownMenuItem
                              onSelect={() =>
                                setDeactivating({
                                  id: employee._id as Id<"employees">,
                                  name: employee.namaLengkap,
                                  status: employee.status,
                                })
                              }
                            >
                              {employee.status === "AKTIF" ? (
                                <>
                                  <UserMinus /> Nonaktifkan
                                </>
                              ) : (
                                <>
                                  <RotateCcw /> Aktifkan kembali
                                </>
                              )}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Diperbarui {formatDate(new Date().toISOString().slice(0, 10))} · Usia dan masa kerja
        dihitung dari tanggal, bukan dari nilai yang tersimpan di spreadsheet.
      </p>

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        employeeId={editing}
      />

      <AlertDialog open={!!deactivating} onOpenChange={(open) => !open && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {deactivating?.status === "AKTIF" ? "Nonaktifkan karyawan?" : "Aktifkan kembali?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating?.status === "AKTIF" ? (
              <>
                <strong>{deactivating.name}</strong> akan berstatus Tidak Aktif. Riwayat kontrak,
                kehadiran, cuti, dan dokumen tetap tersimpan. Data tidak dihapus permanen.
              </>
            ) : (
              <>
                <strong>{deactivating?.name}</strong> akan kembali berstatus Aktif dan dapat
                dicatat kehadirannya kembali.
              </>
            )}
          </AlertDialogDescription>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange}>
              Ya, lanjutkan
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
