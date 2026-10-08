import { describe, expect, it } from "vitest";

import { findByName, normalizeLookupKey, REFERENCED_BIDANG, REFERENCED_JABATAN } from "./organization";

const UNITS = REFERENCED_BIDANG.map((nama, index) => ({ _id: `u${index}`, nama }));
const POSITIONS = REFERENCED_JABATAN.map((nama, index) => ({ _id: `p${index}`, nama }));

describe("normalizeLookupKey", () => {
  it("lowercases, strips punctuation and collapses spacing", () => {
    expect(normalizeLookupKey("  KABID.  RUMAH  TANGGA ")).toBe("kabid rumah tangga");
  });

  it("treats & as the word 'dan'", () => {
    expect(normalizeLookupKey("STAF HUMAS & IT")).toBe("staf humas dan it");
  });

  it("returns an empty key for empty input", () => {
    expect(normalizeLookupKey(undefined)).toBe("");
    expect(normalizeLookupKey("   ")).toBe("");
  });
});

describe("findByName for bidang", () => {
  it("matches regardless of case and padding", () => {
    expect(findByName(UNITS, "mudir")?._id).toBe(UNITS[0]!._id);
    expect(findByName(UNITS, "  Madrasah ")?._id).toBe(UNITS[1]!._id);
  });

  it("resolves every bidang used in the master workbook", () => {
    for (const nama of ["Mudir", "Madrasah", "Kepengasuhan", "Keuangan SDM", "Rumah Tangga"]) {
      expect(findByName(UNITS, nama)?.nama, nama).toBe(nama);
    }
  });

  it("returns undefined for blank input instead of guessing", () => {
    expect(findByName(UNITS, "")).toBeUndefined();
    expect(findByName(UNITS, undefined)).toBeUndefined();
  });

  it("returns undefined for a name nothing matches", () => {
    expect(findByName(UNITS, "Perpustakaan")).toBeUndefined();
  });
});

describe("findByName for jabatan", () => {
  it("matches the exact jargon used in the workbook", () => {
    expect(findByName(POSITIONS, "MUDIR")?.nama).toBe("MUDIR");
    expect(findByName(POSITIONS, "KABID. RUMAH TANGGA")?.nama).toBe("KABID. RUMAH TANGGA");
    expect(findByName(POSITIONS, "KAMAD IM")?.nama).toBe("KAMAD IM");
  });

  it("ignores casing and trailing punctuation", () => {
    expect(findByName(POSITIONS, "musyrif")?.nama).toBe("MUSYRIF");
    expect(findByName(POSITIONS, "Guru Umum")?.nama).toBe("GURU UMUM");
  });

  it("normalises & before comparing", () => {
    expect(findByName(POSITIONS, "STAF TU DAN OPERATOR")?.nama).toBe("STAF TU & OPERATOR");
  });

  it("refuses a partial name that two entries could claim", () => {
    // "RUMAH TANGGA" fits both KABID. RUMAH TANGGA and STAF RUMAH TANGGA.
    expect(findByName(POSITIONS, "RUMAH TANGGA")).toBeUndefined();
  });

  it("maps a workbook-only jabatan onto the closest reference entry", () => {
    // The master workbook writes "PJ. EKSKUL DAN LOMBA"; Referensi stores "STAF EKSKUL DAN LOMBA".
    expect(findByName(POSITIONS, "PJ. EKSKUL DAN LOMBA")?.nama).toBe("STAF EKSKUL DAN LOMBA");
  });

  it("returns undefined when nothing resembles the name", () => {
    expect(findByName(POSITIONS, "Perpustakaan")).toBeUndefined();
  });
});