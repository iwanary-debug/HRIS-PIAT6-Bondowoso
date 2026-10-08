/**
 * Route-level error boundary.
 *
 * Without this, any exception thrown while rendering a page unmounts the whole
 * React tree and the user is left staring at a blank white page with the reason
 * only in the browser console. This boundary instead shows the real message and
 * reports it to the backend (`bootReports:report`) so production failures are
 * diagnosable without asking the user to open devtools.
 */

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { CONVEX_URL } from "@/lib/backendUrl";

interface Props {
  children: React.ReactNode;
  /** Shown in the fallback so the user knows which page failed. */
  pageName?: string;
}

interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error("[RouteErrorBoundary]", error, info.componentStack);
    }
    void reportRouteError(error, this.props.pageName);
  }

  render() {
    const { error } = this.state;
    if (!error) return <>{this.props.children}</>;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-red-100 text-red-700">
          <AlertTriangle className="size-6" />
        </div>
        <div className="max-w-2xl space-y-1">
          <p className="font-semibold text-foreground">
            Halaman ini gagal ditampilkan{this.props.pageName ? `: ${this.props.pageName}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Bukan data Anda yang bermasalah. Kesalahannya sudah dicatat oleh sistem. Silakan muat
            ulang halaman; bila tetap gagal, hubungi Super Admin.
          </p>
        </div>
        <pre className="max-w-2xl overflow-auto rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-left text-xs whitespace-pre-wrap text-red-800">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-800"
        >
          <RefreshCw className="size-4" /> Muat ulang halaman
        </button>
      </div>
    );
  }
}

/**
 * Fire-and-forget report. Uses the plain HTTP mutation endpoint so it works
 * without a ConvexReactClient context, and never throws: a failed report must
 * not replace the original error with a new one.
 */
async function reportRouteError(error: Error, pageName?: string): Promise<void> {
  try {
    await fetch(`${CONVEX_URL}/api/mutation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "bootReports:report",
        args: {
          message: `Route crash${pageName ? ` (${pageName})` : ""}: ${error.message}`.slice(0, 2000),
          userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
          url: typeof window === "undefined" ? undefined : window.location.href,
        },
        format: "json",
      }),
    });
  } catch {
    // The backend report is best-effort.
  }
}
