import { describe, expect, it } from "vitest";

import {
  RESTORE_NATURAL_KEYS,
  RESTORE_ORDER,
  inspectSnapshot,
  isCompleteSnapshot,
  naturalKeyOf,
  type RestorePreview,
} from "./restore";

const COMPLETE_SNAPSHOT = {
  format: "hris-piat6-backup",
  version: 1,
  mode: "full",
  generatedAt: 1_700_000_000_000,
  totalRows: 2,
  tables: {
    users: [{ _id: "u1", email: "hrd@piat6.sch.id", name: "HRD" }],
    employees: [
      { _id: "e1", niy: "2223.070694.1", namaLengkap: "HAJID", bidangId: "x1", jabatanId: "p1" },
    ],
    organizationUnits: [{ _id: "x1", kode: "U01", nama: "Madrasah" }],
  },
};

const EXISTING: Record<string, Set<string>> = {
  users: new Set(["hrd@piat6.sch.id"]),
  employees: new Set<string>(),
  organizationUnits: new Set(["u01"]),
};

function previewOf(snapshot: unknown, existing = EXISTING): RestorePreview {
  return inspectSnapshot(snapshot, existing);
}

describe("isCompleteSnapshot", () => {
  it("treats only `full` as restorable without losing columns", () => {
    expect(isCompleteSnapshot("full")).toBe(true);
    expect(isCompleteSnapshot("safe")).toBe(false);
  });
});

describe("inspectSnapshot", () => {
  it("accepts a well-formed backup and counts new vs existing rows", () => {
    const preview = previewOf(COMPLETE_SNAPSHOT);
    expect(preview.valid).toBe(true);
    expect(preview.totalRows).toBe(3);
    const employees = preview.perTable.find((t) => t.table === "employees");
    expect(employees).toEqual({ table: "employees", rows: 1, newRows: 1, existingRows: 0 });
    const users = preview.perTable.find((t) => t.table === "users");
    expect(users?.existingRows).toBe(1);
  });

  it("rejects a file that is not a backup at all", () => {
    const preview = previewOf({ hello: "world" });
    expect(preview.valid).toBe(false);
    expect(preview.errors.join(" ")).toContain("Format tidak dikenal");
  });

  it("rejects a file with no rows", () => {
    const preview = previewOf({ ...COMPLETE_SNAPSHOT, tables: {} });
    expect(preview.valid).toBe(false);
  });

  it("rejects a truncated file with no version", () => {
    const { version: _version, ...truncated } = COMPLETE_SNAPSHOT;
    expect(previewOf(truncated).valid).toBe(false);
  });

  it("warns that a `safe` backup cannot restore sensitive columns", () => {
    const preview = previewOf({ ...COMPLETE_SNAPSHOT, mode: "safe" });
    expect(preview.valid).toBe(true);
    expect(preview.isComplete).toBe(false);
    expect(preview.warnings.join(" ")).toContain("mode aman");
  });

  it("flags unknown tables instead of importing them blindly", () => {
    const preview = previewOf({
      ...COMPLETE_SNAPSHOT,
      tables: { ...COMPLETE_SNAPSHOT.tables, mysteryTable: [{ a: 1 }] },
    });
    expect(preview.warnings.join(" ")).toContain("mysteryTable");
  });

  it("flags tables that are missing from the file", () => {
    const rest: Record<string, unknown[]> = { ...COMPLETE_SNAPSHOT.tables };
    delete rest.payslips;
    const preview = previewOf({ ...COMPLETE_SNAPSHOT, tables: rest });
    expect(preview.warnings.join(" ")).toContain("payslips");
  });
});

describe("naturalKeyOf", () => {
  it("matches employees on NIY regardless of case and padding", () => {
    expect(naturalKeyOf("employees", { niy: "2223.070694.1" })).toBe(
      naturalKeyOf("employees", { niy: " 2223.070694.1 " }),
    );
  });

  it("matches users on email and units on kode", () => {
    expect(naturalKeyOf("users", { email: "A@B.id" })).toBe("a@b.id");
    expect(naturalKeyOf("organizationUnits", { kode: "U01" })).toBe("u01");
  });

  it("returns an empty key for tables with no business identifier", () => {
    expect(naturalKeyOf("attendanceRecords", { _id: "x" })).toBe("");
  });
});

describe("restore order", () => {
  it("places referenced tables before the tables that point at them", () => {
    const order = RESTORE_ORDER as readonly string[];
    const before = (table: string, dependency: string) =>
      order.indexOf(dependency) < order.indexOf(table);
    // Units and positions must exist before employees reference them.
    expect(before("employees", "organizationUnits")).toBe(true);
    expect(before("employees", "positions")).toBe(true);
    expect(before("positionAssignments", "employees")).toBe(true);
    expect(before("payslips", "payrollPeriods")).toBe(true);
    expect(before("auditLogs", "users")).toBe(true);
  });

  it("covers every table that has a natural key", () => {
    for (const table of Object.keys(RESTORE_NATURAL_KEYS)) {
      expect(RESTORE_ORDER).toContain(table);
    }
  });
});