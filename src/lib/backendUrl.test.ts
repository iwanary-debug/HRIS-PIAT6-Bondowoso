import { describe, expect, it } from "vitest";

import { CONVEX_URL, convexApiUrl } from "@/lib/backendUrl";

describe("backendUrl", () => {
  it("resolves an absolute http(s) URL, whatever VITE_CONVEX_URL contains", () => {
    // Build environments can export a non-URL string here; the Convex client
    // throws on anything without a scheme, which used to blank the whole app.
    expect(CONVEX_URL).toMatch(/^https?:\/\/[^\s/?#]+/);
    expect(() => new URL(CONVEX_URL)).not.toThrow();
  });

  it("never returns a loopback address in a production build", () => {
    if (import.meta.env.DEV) return;
    expect(CONVEX_URL).not.toMatch(/^https?:\/\/(127\.0\.0\.1|localhost)/);
  });

  it("builds the HTTP mutation endpoint from the same base", () => {
    expect(convexApiUrl()).toBe(`${CONVEX_URL}/api/mutation`);
  });
});
