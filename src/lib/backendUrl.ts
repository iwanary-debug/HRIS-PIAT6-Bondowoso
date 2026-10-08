/**
 * Single source of truth for the Convex backend URL.
 *
 * Resolution order (runtime, independent of build-time env quirks):
 * 1. A real cloud URL baked via VITE_CONVEX_URL at build time wins.
 * 2. A loopback value (dev companion backend, scripts/convex-backend.mjs) is
 *    unreachable for remote preview browsers, so in dev the URL is derived
 *    from the page origin instead (host `5173-<workspace>` -> `3210-<...>`).
 * 3. Nothing usable (production deploys where env files are not shipped, or a
 *    polluted VITE_CONVEX_URL that is not a URL at all): fall back to the cloud
 *    deployment. The URL is not a secret — it is embedded in the client bundle
 *    by design.
 *
 * The absolute-URL check matters: some build environments export a non-URL
 * string under VITE_CONVEX_URL, and passing that to the Convex client throws
 * `Provided address was not an absolute URL` and leaves a blank page.
 */

const CLOUD_BACKEND_URL = "https://hallowed-warthog-725.convex.cloud";

const ABSOLUTE_HTTP_RE = /^https?:\/\/[^\s/?#]+/i;
const LOOPBACK_RE = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

function pageOriginUrl(): string {
  if (typeof window === "undefined") return CLOUD_BACKEND_URL;
  const mapped = /^5173-(.+)$/.exec(window.location.hostname);
  const host = mapped ? `3210-${mapped[1]}` : window.location.hostname;
  return `${window.location.protocol}//${host}${window.location.port ? ":3210" : ""}`;
}

/** The baked env value, but only when it really is an absolute http(s) URL. */
function bakedBackendUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const raw = (env?.VITE_CONVEX_URL ?? "").trim();
  return ABSOLUTE_HTTP_RE.test(raw) ? raw : "";
}

function resolveConvexUrl(): string {
  const raw = bakedBackendUrl();
  if (!raw) return CLOUD_BACKEND_URL;
  if (LOOPBACK_RE.test(raw)) {
    return import.meta.env.DEV ? pageOriginUrl() : CLOUD_BACKEND_URL;
  }
  return raw;
}

export const CONVEX_URL: string = resolveConvexUrl();

/** HTTP mutation endpoint (uploads etc.), same base as ConvexReactClient. */
export function convexApiUrl(): string {
  return `${CONVEX_URL}/api/mutation`;
}
