import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { Bell, LogOut, Menu, Search, UserCog } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { useAuth } from "@/providers/AuthProvider";
import { initialsOf } from "@/lib/format";
import { GlobalSearch } from "@/components/shell/GlobalSearch";

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { user, logout, roleLabel } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const pending = useQuery(api.notifications.pendingCount, {});

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-card/90 px-4 backdrop-blur lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Buka menu navigasi"
      >
        <Menu className="size-5" />
      </Button>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="group flex h-9 flex-1 items-center gap-2 rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground transition hover:border-navy-200 hover:bg-muted sm:max-w-md"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Cari karyawan, jabatan, unit…</span>
        <kbd className="hidden rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {pending && pending.leave + pending.resignations + pending.contracts > 0 && (
          <Link
            to="/app/leave"
            className="hidden items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-200 sm:inline-flex"
          >
            <Bell className="size-3.5" />
            {pending.leave + pending.resignations + pending.contracts} perlu tindakan
          </Link>
        )}
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          asChild
        >
          <Link to="/app/import">Import Data</Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition hover:bg-accent"
            >
              <span className="grid size-8 place-items-center rounded-full bg-navy-800 text-xs font-semibold text-white">
                {initialsOf(user?.name)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-[13px] font-semibold leading-tight">
                  {user?.name ?? "—"}
                </span>
                <span className="block text-[11px] leading-tight text-muted-foreground">
                  {roleLabel ?? ""}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate">{user?.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {user?.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/app/profile")}>
              <UserCog /> Profil Saya
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void logout();
                navigate("/auth", { replace: true });
              }}
            >
              <LogOut /> Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
