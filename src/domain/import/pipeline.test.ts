import { describe, expect, it } from "vitest";

import { suggestMapping } from "./mapping";
import { isBlankRow, sanitizeRowsForConvex, toConvexCell } from "./normalize"; // isBlankRow works on cell arrays, not objects
import {
  applyDuplicateRule,
  describeEmptyRows,
  emptySummary,
  isEmptyRow,
  summarize,
  summarizeIssues,
  validateRow,
  type ValidatedRow,
} from "./validate";

const REF = new Date("2026-09-15T00:00:00");

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    niy: "SAMPLE-0001",
    namaLengkap: "Ahmad Fauzi",
    bidang: "Madrasah",
    jabatan: "Guru",
    status: "Aktif",
    ...overrides,
  };
}

describe("normalize", () => {
  it("detects blank and formatting-only rows", () => {
    expect(isBlankRow(["", "   ", null])).toBe(true);
    expect(isBlankRow(["SAMPLE-1", "Budi"])).toBe(false);
    expect(isBlankRow([])).toBe(true);
  });
});

describe("sanitizeRowsForConvex", () => {
  it("turns XLSX Date cells into yyyy-mm-dd strings", () => {
    // Convex rejects `Date` ("not a supported Convex type"), so any date cell
    // has to leave the browser as a plain string.
    const rows = sanitizeRowsForConvex([
      ["2223.070694.1", "HAJID THALIB", new Date("1994-06-07T00:00:00")],
    ]);
    expect(rows).toEqual([["2223.070694.1", "HAJID THALIB", "1994-06-07"]]);
    for (const cell of rows[0]!) {
      expect(["string", "number", "boolean"]).toContain(typeof cell);
    }
  });

  it("keeps plain numbers as numbers so usia is not read as a serial date", () => {
    expect(sanitizeRowsForConvex([[32, 0, 3]])).toEqual([[32, 0, 3]]);
  });

  it("replaces blanks, undefined and non-finite numbers with null", () => {
    expect(sanitizeRowsForConvex([["", "  ", undefined, null, Number.NaN, Infinity]])).toEqual([
      [null, null, null, null, null, null],
    ]);
  });

  it("never emits a Date, object or undefined for exotic cells", () => {
    expect(toConvexCell(new Date(Number.NaN))).toBeNull();
    expect(toConvexCell({ weird: true })).toBeNull();
    expect(toConvexCell(false)).toBe(false);
  });
});

describe("suggestMapping", () => {
  it("maps standard Indonesian headers to the source schema", () => {
    const suggestions = suggestMapping(["NIY", "Nama Lengkap", "Bidang", "Jabatan", "Tanggal Bergabung"]);
    expect(suggestions[0]).toMatchObject({ rawHeader: "NIY", column: "niy" });
    expect(suggestions[1]).toMatchObject({ column: "namaLengkap" });
    expect(suggestions[2]).toMatchObject({ column: "bidang" });
    expect(suggestions[4]).toMatchObject({ column: "tanggalBergabung" });
  });

  it("marks unknown headers as UNMATCHED", () => {
    const suggestions = suggestMapping(["XYZZY123", "NIY"]);
    expect(suggestions[0]).toMatchObject({ column: null, confidence: "UNMATCHED" });
    expect(suggestions[1]).toMatchObject({ column: "niy" });
  });
});

describe("validateRow", () => {
  it("accepts a complete row as NEW-ready", () => {
    const validated = validateRow(
      row({ "tanggal bergabung": "01/03/2024", tanggalBergabung: "01/03/2024" }),
      1,
      new Set(),
      new Set(),
      REF,
    );
    expect(validated.issues.some((issue) => issue.severity === "ERROR")).toBe(false);
    expect(validated.derived.status).toBe("AKTIF");
    expect(validated.duplicate).toBeNull();
  });

  it("requires NIY and Nama Lengkap", () => {
    const noNiy = validateRow(row({ niy: "" }), 1, new Set(), new Set(), REF);
    expect(noNiy.issues.filter((i) => i.severity === "ERROR").map((i) => i.column)).toContain("niy");

    const noName = validateRow(row({ namaLengkap: "" }), 1, new Set(), new Set(), REF);
    expect(noName.issues.filter((i) => i.severity === "ERROR").map((i) => i.column)).toContain(
      "namaLengkap",
    );
  });

  it("rejects a NIK that is not 16 digits", () => {
    const validated = validateRow(row({ nik: "12345" }), 1, new Set(), new Set(), REF);
    expect(validated.issues.some((issue) => issue.column === "nik" && issue.severity === "ERROR")).toBe(true);
  });

  it("flags a duplicate against the database", () => {
    const validated = validateRow(
      row({}),
      1,
      new Set(["sample-0001"]),
      new Set(),
      REF,
    );
    expect(validated.duplicate).toMatchObject({ niy: "SAMPLE-0001", source: "DATABASE" });
  });

  it("flags a duplicate inside the same file", () => {
    const validated = validateRow(row({}), 2, new Set(), new Set(["sample-0001"]), REF);
    expect(validated.duplicate).toMatchObject({ source: "IN_FILE" });
  });

  it("recognises Indonesian status synonyms", () => {
    const validated = validateRow(row({ status: "Mengundurkan diri" }), 1, new Set(), new Set(), REF);
    expect(validated.derived.status).toBe("RESIGN");
    // Resign without TMT raises a warning
    expect(validated.issues.some((issue) => issue.column === "tmtResign" && issue.severity === "WARNING")).toBe(true);
  });
});

describe("applyDuplicateRule", () => {
  const rows: ValidatedRow[] = [
    validateRow(row({ niy: "NEW-1" }), 1, new Set(), new Set(), REF),
    validateRow(row({ niy: "SAMPLE-0001" }), 2, new Set(["sample-0001"]), new Set(), REF),
    validateRow(row({ niy: "IN-FILE" }), 3, new Set(), new Set(["in-file"]), REF),
  ];

  it("never silently overwrites: SKIP leaves the row out", () => {
    const result = applyDuplicateRule(rows, "SKIP");
    expect(result[0]!.action).toBe("NEW");
    expect(result[1]!.action).toBe("SKIP");
    expect(result[2]!.action).toBe("ERROR"); // in-file duplicates are always errors
  });

  it("UPDATE marks db duplicates for update", () => {
    const result = applyDuplicateRule(rows, "UPDATE");
    expect(result[1]!.action).toBe("UPDATE");
  });

  it("ERROR blocks db duplicates too", () => {
    const result = applyDuplicateRule(rows, "ERROR");
    expect(result[1]!.action).toBe("ERROR");
  });
});

describe("summarizeIssues", () => {
  it("groups issues per rule, ERROR first, and keeps an example message", () => {
    const rows = [
      validateRow(row({ nik: "123", tanggalBergabung: "2020-01-01" }), 1),
      validateRow(row({ nik: "3511110707940002", tanggalBergabung: "2020-01-01" }), 2),
      validateRow(row({ namaLengkap: "", email: "bukan-email", tanggalBergabung: "2020-01-01" }), 3),
    ];
    const breakdown = summarizeIssues(rows);
    expect(breakdown.map((b) => `${b.severity}:${b.label}:${b.count}`)).toEqual([
      "ERROR:NIK:1",
      "ERROR:Nama Lengkap:1",
      "WARNING:Email:1",
    ]);
    expect(breakdown[0]!.example).toContain("NIK harus 16 digit");
    expect(breakdown[1]!.example).toContain("Nama Lengkap wajib diisi");
    expect(breakdown[1]!.firstRowNumber).toBe(3);
  });

  it("returns nothing when every row is clean", () => {
    expect(
      summarizeIssues([
        validateRow(
          row({
            nik: "3511110707940002",
            bidang: "Madrasah",
            jabatan: "Guru",
            tanggalBergabung: "2020-01-01",
          }),
          1,
        ),
      ]),
    ).toEqual([]);
  });
});

describe("empty rows (no NIY, no name)", () => {
  it("does not turn a non-employee row into a wall of errors", () => {
    const record = { bidang: "", jabatan: "", tanggalBergabung: "" };
    const validated = validateRow(record, 91, new Set(), new Set(), REF, ["Total", "", "", ""]);
    expect(validated.issues.some((i) => i.severity === "ERROR")).toBe(false);
    expect(validated.issues.filter((i) => i.severity === "WARNING")).toHaveLength(0);
    expect(validated.issues[0]!.message).toContain("dilewati");
    expect(isEmptyRow(validated)).toBe(true);
  });

  it("is skipped instead of blocking the import", () => {
    const rows = [
      validateRow({ niy: "A-1", namaLengkap: "Budi" }, 1, new Set(), new Set(), REF, ["A-1", "Budi"]),
      validateRow({}, 91, new Set(), new Set(), REF, ["Total", "90 orang"]),
    ];
    const [withData, empty] = applyDuplicateRule(rows, "SKIP");
    expect(withData.action).toBe("NEW");
    expect(empty.action).toBe("SKIP_EMPTY");

    const summary = summarize([withData, empty]);
    expect(summary.emptyRows).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.valid).toBe(1);
    expect(summary.totalRows).toBe(2);
  });

  it("explains what the skipped row actually contained", () => {
    const rows = [
      validateRow({}, 91, new Set(), new Set(), REF, ["Total", "90 orang", ""]),
      validateRow({}, 92, new Set(), new Set(), REF, ["Total", "90 orang", ""]),
    ];
    const described = describeEmptyRows(rows);
    expect(described).toEqual({
      count: 2,
      exampleRowNumber: 91,
      exampleCells: "Total · 90 orang",
    });
    expect(describeEmptyRows([validateRow(row({}), 1, new Set(), new Set(), REF, ["A", "B"])])).toBeNull();
  });
});

describe("summarize", () => {
  it("counts valid, error, duplicate and action buckets", () => {
    const rows = applyDuplicateRule(
      [
        validateRow(row({ niy: "A" }), 1, new Set(), new Set(), REF),
        validateRow(row({ niy: "B" }), 2, new Set(["b"]), new Set(), REF),
        validateRow(row({ niy: "", namaLengkap: "" }), 3, new Set(), new Set(), REF),
      ],
      "UPDATE",
    );
    const summary = summarize(rows);
    expect(summary.totalRows).toBe(3);
    expect(summary.errors).toBe(0);
    expect(summary.emptyRows).toBe(1);
    expect(summary.newRecords).toBe(1);
    expect(summary.updatedRecords).toBe(1);
    expect(summary.duplicates).toBe(1);
  });

  it("starts from a zeroed summary", () => {
    expect(emptySummary()).toMatchObject({
      totalRows: 0,
      valid: 0,
      errors: 0,
      duplicates: 0,
    });
  });
});
