import { describe, expect, it } from "vitest";

import { backupFilename, describeBackup, type BackupSnapshot } from "./backup";

const SNAPSHOT: BackupSnapshot = {
  format: "hris-piat6-backup",
  version: 1,
  mode: "safe",
  generatedAt: Date.UTC(2026, 9, 1, 15, 4, 22),
  generatedBy: { name: "HRD", email: "hrd@piat6.sch.id", role: "SUPER_ADMIN" },
  counts: { employees: 90, positions: 35, payslips: 0 },
  totalRows: 125,
  tables: { employees: [], positions: [], payslips: [] },
};

describe("backupFilename", () => {
  it("stamps the date and time and sorts chronologically", () => {
    expect(backupFilename(SNAPSHOT.generatedAt)).toBe("PIAT6-BACKUP-2026-10-01T15-04-22.json");
  });

  it("never leaves colons in the name", () => {
    // A colon in a filename is illegal on Windows and confuses shell scripts.
    expect(backupFilename(SNAPSHOT.generatedAt)).not.toContain(":");
  });
});

describe("describeBackup", () => {
  it("reports row counts, filled tables and a readable date", () => {
    const summary = describeBackup(SNAPSHOT);
    expect(summary).toContain("125 baris");
    expect(summary).toContain("2/3 tabel terisi");
  });
});