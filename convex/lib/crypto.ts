/**
 * Cryptography helpers for HRIS PIAT6.
 *
 * Password hashing uses scrypt (memory-hard) from @noble/hashes, which runs
 * inside the Convex V8 isolate without any native dependency. Session tokens
 * are stored only as SHA-256 hashes.
 */

import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 32, asyncTick: 10 } as const;

export async function hashPassword(password: string, salt?: string): Promise<string> {
  const useSalt = salt ?? bytesToHex(randomBytes(16));
  const derived = await scryptAsync(utf8ToBytes(password), utf8ToBytes(useSalt), SCRYPT_PARAMS);
  return `scrypt$${useSalt}$${bytesToHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const derived = await scryptAsync(utf8ToBytes(password), utf8ToBytes(salt), SCRYPT_PARAMS);
  return constantTimeEqual(bytesToHex(derived), expected);
}

export function generateToken(bytes = 32): string {
  return bytesToHex(randomBytes(bytes));
}

export function hashToken(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(token)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
