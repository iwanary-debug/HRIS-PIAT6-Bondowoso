/**
 * Session JWT minting (server-side) and verification — ES256.
 *
 * Convex's WebSocket sync protocol requires identity tokens in JWT form,
 * validated against an auth provider configured in convex/auth.config.ts.
 * Convex supports RS256/ES256 only, so the HRIS self-issues short-lived
 * ES256 session JWTs whose `sub` is the SHA-256 hash of the server-side
 * opaque session token. The sessions table stays the source of truth, so
 * logout and revocation remain server-side.
 *
 * Pure-JS implementation (base64url + @noble/curves p256) so it runs inside
 * the Convex V8 isolate without Node APIs or WebCrypto availability
 * guarantees.
 */

import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

// Convex functions run with a `process.env` shim (deployment env vars); the
// DOM/lib tsconfig has no Node types, so declare the shape we rely on.
declare const process: { env: Record<string, string | undefined> };

export const JWT_ISSUER = "https://hris-piat6.local";
export const JWT_AUDIENCE = "hris-piat6-app";
const SESSION_JWT_TTL_S = 12 * 60 * 60; // matches lib/auth SESSION_TTL_MS

const B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_LOOKUP: Record<string, number> = {};
for (let index = 0; index < B64URL_ALPHABET.length; index += 1) {
  B64URL_LOOKUP[B64URL_ALPHABET[index]] = index;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const remaining = bytes.length - index;
    const b0 = bytes[index];
    const b1 = remaining > 1 ? bytes[index + 1] : 0;
    const b2 = remaining > 2 ? bytes[index + 2] : 0;
    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (remaining > 1) out += B64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (remaining > 2) out += B64URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function base64UrlToBytes(text: string): Uint8Array {
  let bits = 0;
  let accumulator = 0;
  const out: number[] = [];
  for (const character of text) {
    if (character === "=") break;
    const value = B64URL_LOOKUP[character];
    if (value === undefined) throw new Error("BAD_BASE64URL");
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((accumulator >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function base64Std(bytes: Uint8Array): string {
  const url = bytesToBase64Url(bytes);
  const remainder = url.length % 4;
  const padded = remainder === 0 ? url : url + "=".repeat(4 - remainder);
  return padded.replaceAll("-", "+").replaceAll("_", "/");
}

/**
 * The signing key material. Set SESSION_JWT_SECRET (64 hex chars = 32 bytes)
 * as a deployment environment variable in production; the fallback keeps
 * local dev deployments working out of the box.
 */
function signingSecretString(): string {
  const hex = process.env.SESSION_JWT_SECRET;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return `hex:${hex.toLowerCase()}`;
  return "hris-piat6-local-dev-secret";
}

function privateKeyBytes(): Uint8Array {
  // Production: explicit 32-byte private key from the deployment environment
  // (SESSION_JWT_PRIVATE_KEY_HEX, 64 hex chars) — paired with the public key
  // published in convex/auth.config.ts JWKS.
  const hexKey = process.env.SESSION_JWT_PRIVATE_KEY_HEX;
  if (hexKey && /^[0-9a-fA-F]{64}$/.test(hexKey)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      bytes[index] = parseInt(hexKey.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }
  // Local dev fallback derived from the dev secret string.
  return sha256(utf8ToBytes(`hris-piat6:es256:${signingSecretString()}`));
}

function publicKeyBytes(): Uint8Array {
  return p256.getPublicKey(privateKeyBytes(), false);
}

/** JWKS document for convex/auth.config.ts (ES256 / P-256 public key). */
export function exportJwks(): { keys: Array<Record<string, string>> } {
  const pub = publicKeyBytes();
  // Uncompressed point: 0x04 || X(32) || Y(32)
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  return {
    keys: [
      {
        kty: "EC",
        crv: "P-256",
        x: bytesToBase64Url(x),
        y: bytesToBase64Url(y),
        alg: "ES256",
        use: "sig",
        kid: "hris-session-1",
      },
    ],
  };
}

/** JWKS as a data URI so the backend never fetches an external URL. */
export function jwksDataUri(): string {
  return `data:application/json;charset=utf-8;base64,${base64Std(
    utf8ToBytes(JSON.stringify(exportJwks())),
  )}`;
}

function es256Sign(digest: Uint8Array): Uint8Array {
  return p256.sign(digest, privateKeyBytes(), { prehash: false, lowS: true });
}

function es256Verify(digest: Uint8Array, signature: Uint8Array): boolean {
  return p256.verify(signature, digest, publicKeyBytes(), { prehash: false });
}

export function mintSessionJwt(tokenHashHex: string): string {
  const now = Math.floor(Date.now() / 1000);
  const headerPart = bytesToBase64Url(utf8ToBytes(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "hris-session-1" })));
  const payloadPart = bytesToBase64Url(
    utf8ToBytes(
      JSON.stringify({
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        sub: tokenHashHex,
        iat: now,
        exp: now + SESSION_JWT_TTL_S,
      }),
    ),
  );
  const digest = sha256(utf8ToBytes(`${headerPart}.${payloadPart}`));
  const signature = es256Sign(digest);
  return `${headerPart}.${payloadPart}.${bytesToBase64Url(signature)}`;
}

export interface VerifiedSessionJwt {
  /** SHA-256 hex of the server-side opaque session token (JWT `sub`). */
  subject: string;
  expiresAtMs: number;
}

/** Returns null when the JWT is malformed, forged, or expired. */
export function verifySessionJwt(jwt: string): VerifiedSessionJwt | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  let payloadJson: string;
  try {
    payloadJson = new TextDecoder().decode(base64UrlToBytes(payloadPart));
    const digest = sha256(utf8ToBytes(`${headerPart}.${payloadPart}`));
    const signature = base64UrlToBytes(signaturePart);
    if (!es256Verify(digest, signature)) return null;
  } catch {
    return null;
  }
  try {
    const claims = JSON.parse(payloadJson) as {
      iss?: string;
      aud?: string;
      sub?: string;
      exp?: number;
    };
    if (claims.iss !== JWT_ISSUER || claims.aud !== JWT_AUDIENCE) return null;
    if (!claims.sub || !claims.exp) return null;
    const expiresAtMs = claims.exp * 1000;
    if (expiresAtMs < Date.now()) return null;
    return { subject: claims.sub, expiresAtMs };
  } catch {
    return null;
  }
}

/** Test helper: round-trip self-verification (used in a temporary probe). */
export function selfTest(): string {
  const jwt = mintSessionJwt(bytesToHex(sha256(utf8ToBytes("selftest"))));
  return verifySessionJwt(jwt) ? "OK" : "FAIL";
}
