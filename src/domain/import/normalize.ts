/**
 * Import Karyawan — value coercion and header normalisation.
 * Pure functions so they can run identically in the browser (preview) and on
 * the server (commit re-validation).
 */

/** "Tanggal Lahir" / "TGL LAHIR " / "1. Nama Lengkap" -> "tanggal lahir" */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\s*\d+\s*[.)]\s*/, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((cell) => {
    if (cell === null || cell === undefined) return true;
    if (typeof cell === "number") return Number.isNaN(cell);
    return String(cell).trim() === "";
  });
}

/** Accepts `Date` (XLSX serial), `yyyy-mm-dd`, `dd/mm/yyyy`, `dd-mm-yyyy`. */
export function coerceDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatDate(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date (1900 epoch, with the Lotus leap-year bug offset).
    const ms = Math.round((value - 25569) * 86_400_000);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : formatDate(date);
  }
  const text = String(value).trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) return buildDate(+match[1]!, +match[2]!, +match[3]!);

  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) return buildDate(+match[3]!, +match[2]!, +match[1]!);

  // Indonesian long form: "12 Maret 1990" is accepted by Date.parse.
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : formatDate(parsed);
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return formatDate(date);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The only value shapes Convex accepts over the wire. */
export type ConvexCell = string | number | boolean | null;

/**
 * Coerce a raw sheet cell into a Convex-transportable value.
 *
 * XLSX hands back real `Date` objects for date-formatted cells; Convex rejects
 * those ("Date ... is not a supported Convex type"), so they become plain
 * `yyyy-mm-dd` strings here. Numbers stay numbers — `usia` must not be mistaken
 * for an Excel serial date.
 */
export function toConvexCell(value: unknown): ConvexCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return coerceDate(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  // Objects/arrays/symbols are never valid sheet cells; drop them.
  return null;
}

/** Sanitize a whole sheet before posting it to Convex. */
export function sanitizeRowsForConvex(
  rows: readonly (readonly unknown[])[],
): ConvexCell[][] {
  return rows.map((row) => Array.from(row, toConvexCell));
}

export function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).replace(/[^\d,.\-]/g, "").replace(",", ".");
  if (!text) return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/** Loose enum match: case/space/punctuation insensitive, plus common synonyms. */
export function coerceEnum(
  value: unknown,
  allowed: readonly string[],
  synonyms: Record<string, string> = {},
): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const key = normalizeHeader(text);
  if (synonyms[key]) return synonyms[key];
  const direct = allowed.find((option) => normalizeHeader(option) === key);
  if (direct) return direct;
  const compact = key.replace(/[^a-z0-9]/g, "");
  const loose = allowed.find((option) => normalizeHeader(option).replace(/[^a-z0-9]/g, "") === compact);
  return loose ?? null;
}
