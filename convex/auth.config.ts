/**
 * Convex auth provider configuration.
 *
 * The HRIS self-issues ES256 session JWTs (convex/lib/sessionJwt.ts) whose
 * `sub` is the SHA-256 hash of the server-side opaque session token. This
 * provider lets the Convex runtime verify those JWTs on the WebSocket sync
 * protocol; the actual authorization (which session is alive, which user,
 * which permissions) is enforced in convex/lib/auth.ts against the sessions
 * table — the source of truth — so logout and revocation stay server-side.
 *
 * NOTE: JWKS is inlined as a data URI (public key only, no secret) and kept
 * free of imports so the push evaluator can bundle/execute it trivially.
 * If SESSION_JWT_SECRET is later changed in production, regenerate this
 * constant with `jwksDataUri()` and redeploy.
 */

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "hris-piat6-app",
      issuer: "https://hris-piat6.local",
      jwks: "data:application/json;charset=utf-8;base64,eyJrZXlzIjpbeyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IlBVV1FxZ1FzR2phdzNWY3lFMWd6ay11aXB6SW5iaEZoN0p2Q3dpak1wTFkiLCJ5IjoiMVYyM1dzM0dMMFgteTFPWGRLZ2pfM0VPZW1OdTlOM0JGbFVRamdLRmxOMCIsImFsZyI6IkVTMjU2IiwidXNlIjoic2lnIiwia2lkIjoiaHJpcy1zZXNzaW9uLTEifV19",
      algorithm: "ES256",
    },
  ],
};
