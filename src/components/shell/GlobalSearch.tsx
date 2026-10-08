import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { Loader2, Search, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/overlays";
import { Input } from "@/components/ui/input";
import { initialsOf } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [term, setTerm] = React.useState("");
  const navigate = useNavigate();
  const debounced = useDebouncedValue(term.trim(), 250);

  const results = useQuery(
    api.employees.list,
    open && debounced.length >= 2
      ? { search: debounced, pageSize: 8, includeInactive: false }
      : "skip",
  );

  React.useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-3 p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-base">Cari cepat</DialogTitle>
          <DialogDescription className="sr-only">
            Cari karyawan berdasarkan NIY, nama, jabatan, atau unit.
          </DialogDescription>
        </DialogHeader>
        <div className="relative px-5">
          <Search className="pointer-events-none absolute left-8 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Ketik NIY atau nama karyawan…"
            className="pl-9"
          />
        </div>
        <div className="max-h-80 overflow-y-auto px-2 pb-3 scrollbar-thin">
          {debounced.length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ketik minimal 2 karakter untuk mulai mencari.
            </p>
          ) : results === undefined ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
              Mencari…
            </p>
          ) : results.data.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Tidak ada karyawan yang cocok dengan “{debounced}”.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {results.data.map((employee) => (
                <li key={employee._id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/app/employees/${employee._id}`);
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-accent"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy-100 text-[11px] font-semibold text-navy-800">
                      {initialsOf(employee.namaLengkap)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {employee.namaLengkap}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {employee.niy} · {employee.jabatan ?? "Tanpa jabatan"} ·{" "}
                        {employee.bidang ?? "Tanpa unit"}
                      </span>
                    </span>
                    <UserRound className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
