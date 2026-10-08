import { ConvexReactClient } from "convex/react";
import { CONVEX_URL } from "@/lib/backendUrl";

const TOKEN_KEY = "hris.session.token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

/**
 * The Convex client asks for the bearer token on every request. The token is
 * the opaque session id; only its SHA-256 hash exists on the server.
 */
export const convex = new ConvexReactClient(CONVEX_URL, {
  webSocket: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

convex.setAuth(async () => getStoredToken() ?? "");
