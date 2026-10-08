/**
 * Client-side backup helpers.
 *
 * A backup only counts as a backup once it has LEFT the backend, so the file is
 * written straight to the operator's own disk via a download. Nothing is kept
 * on the server — if the Convex project were deleted, a server-side copy would
 * go with it.
 */

import { downloadBlob } from "./exporters";

export type BackupMode = "safe" | "full";

/** Shape returned by `api.backup.createSnapshot`. */
export interface BackupSnapshot {
  format: string;
  version: number;
  mode: BackupMode;
  generatedAt: number;
  generatedBy: { name: string; email: string; role: string } | null;
  counts: Record<string, number>;
  totalRows: number;
  tables: Record<string, unknown[]>;
}

/**
 * `PIAT6-BACKUP-2026-10-01T15-04-22.json` — sorts chronologically in any file
 * browser, and says at a glance when the archive was taken.
 */
export function backupFilename(generatedAt: number): string {
  const iso = new Date(generatedAt).toISOString();
  return `PIAT6-BACKUP-${iso.slice(0, 10)}T${iso.slice(11, 19).replace(/:/g, "-")}.json`;
}

export function downloadBackup(snapshot: BackupSnapshot): string {
  const filename = backupFilename(snapshot.generatedAt);
  // Pretty-printed: an operator may need to open this in a text editor after a
  // bad deploy, and a minified 300-row dump is miserable to read by hand.
  downloadBlob(JSON.stringify(snapshot, null, 2), filename, "application/json");
  return filename;
}

/** Human summary shown right after the download, so nothing is left guessing. */
export function describeBackup(snapshot: BackupSnapshot): string {
  const tables = Object.keys(snapshot.tables).length;
  const filled = Object.values(snapshot.counts).filter((n) => n > 0).length;
  const date = new Date(snapshot.generatedAt).toLocaleString("id-ID");
  return `${snapshot.totalRows.toLocaleString("id-ID")} baris · ${filled}/${tables} tabel terisi · ${date}`;
}