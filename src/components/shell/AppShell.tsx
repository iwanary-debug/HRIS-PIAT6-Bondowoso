import * as React from "react";
import { useQuery } from "convex/react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/providers/AuthProvider";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/** Signed-in application shell: sidebar + topbar + routed content. */
export function AppShell() {
  const { status } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const profile = useQuery(api.auth.currentProfile, status === "authenticated" ? {} : "skip");

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // An account issued with a temporary password must replace it before it can
  // reach any other page; otherwise the shared secret lives on indefinitely.
  if (profile?.mustChangePassword && location.pathname !== "/app/profile") {
    return <Navigate to="/app/profile" replace />;
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">Memuat sesi…</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?returnTo=${returnTo}`} replace />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-navy-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 animate-fade-in">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[264px]">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-7">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
