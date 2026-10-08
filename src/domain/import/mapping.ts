/**
 * Import Karyawan — header auto-mapping.
 * Matches the uploaded header row against the canonical column catalogue.
 */

import { SOURCE_COLUMNS, type SourceColumnKey } from "./columns";
import { isBlankRow, normalizeHeader } from "./normalize";
import { type ValidatedRow, validateRow } from "./validate";

export type ColumnMapping = Record<string, SourceColumnKey | null>;

export interface MappingSuggestion {
  /** Index of the header cell in the uploaded sheet. */
  headerIndex: number;
  rawHeader: string;
  column: SourceColumnKey | null;
  confidence: "AUTO" | "FUZZY" | "UNMATCHED";
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared === 0 ? 0 : shared / Math.max(setA.size, setB.size);
}

export function suggestMapping(headerRow: readonly unknown[]): MappingSuggestion[] {
  const taken = new Set<SourceColumnKey>();
  const suggestions: MappingSuggestion[] = headerRow.map((raw, headerIndex) => {
    const rawHeader = raw === null || raw === undefined ? "" : String(raw).trim();
    const normalized = normalizeHeader(rawHeader);
    let column: SourceColumnKey | null = null;
    let confidence: MappingSuggestion["confidence"] = "UNMATCHED";

    if (normalized) {
      // 1. Exact alias match (highest confidence).
      const exact = SOURCE_COLUMNS.find(
        (candidate) =>
          !taken.has(candidate.key) &&
          [candidate.label.toLowerCase(), ...candidate.aliases].some(
            (alias) => normalizeHeader(alias) === normalized,
          ),
      );
      if (exact) {
        column = exact.key;
        confidence = "AUTO";
      } else {
        // 2. Best fuzzy match above threshold, still unclaimed.
        let best: { key: SourceColumnKey; score: number } | null = null;
        for (const candidate of SOURCE_COLUMNS) {
          if (taken.has(candidate.key)) continue;
          const score = Math.max(
            similarity(normalized, normalizeHeader(candidate.label)),
            ...candidate.aliases.map((alias) => similarity(normalized, normalizeHeader(alias))),
          );
          if (!best || score > best.score) best = { key: candidate.key, score };
        }
        if (best && best.score >= 0.6) {
          column = best.key;
          confidence = "FUZZY";
        }
      }
      if (column) taken.add(column);
    }
    return { headerIndex, rawHeader, column, confidence };
  });
  return suggestions;
}

/** Convert raw sheet rows into raw records using the chosen mapping. */
export function materialize(
  rows: readonly unknown[][],
  mapping: ColumnMapping,
  startIndex: number,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (isBlankRow(row)) continue;
    const record: Record<string, unknown> = {};
    for (const [headerIndex, column] of Object.entries(mapping)) {
      if (!column) continue;
      const index = Number(headerIndex);
      if (index < row.length) record[column] = row[index];
    }
    out.push(record);
    void startIndex;
  }
  return out;
}

export interface BuildPreviewInput {
  rows: readonly unknown[][];
  mapping: ColumnMapping;
  existingNiy: ReadonlySet<string>;
  reference?: Date;
}

/** Build the full validation preview (blank rows already dropped by caller). */
export function buildPreview({
  rows,
  mapping,
  existingNiy,
  reference = new Date(),
}: BuildPreviewInput): ValidatedRow[] {
  const records = materialize(rows, mapping, 0);
  const seen = new Set<string>();
  const dataRows = rows.filter((row) => !isBlankRow(row));
  return records.map((record, index) => {
    const row = validateRow(record, index + 1, existingNiy, seen, reference, dataRows[index]);
    if (row.niy) seen.add(row.niy.toLowerCase());
    return row;
  });
}
