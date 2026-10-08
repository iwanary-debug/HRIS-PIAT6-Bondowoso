/**
 * Shared name resolution for units and positions.
 *
 * `employees` stores ids only; every read path resolves display names here so
 * the employee master never needs denormalised copies of unit/position text.
 *
 * Matching itself is pure and lives in `src/domain/organization` so it can be
 * unit tested; this module only adds the Convex-specific reads and the
 * resolve-or-create writes used by the import pipeline.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findByName, normalizeLookupKey } from "../../src/domain/organization";

export interface NameMaps {
  unitNames: Map<Id<"organizationUnits">, string>;
  positionNames: Map<Id<"positions">, string>;
  unitIdByName: Map<string, Id<"organizationUnits">>;
  positionIdByName: Map<string, Id<"positions">>;
}

export async function loadNameMaps(ctx: QueryCtx): Promise<NameMaps> {
  const [units, positions] = await Promise.all([
    ctx.db.query("organizationUnits").collect(),
    ctx.db.query("positions").collect(),
  ]);
  const unitNames = new Map<Id<"organizationUnits">, string>();
  const unitIdByName = new Map<string, Id<"organizationUnits">>();
  for (const unit of units) {
    unitNames.set(unit._id, unit.nama);
    putIndex(unitIdByName, unit.nama, unit._id);
  }
  const positionNames = new Map<Id<"positions">, string>();
  const positionIdByName = new Map<string, Id<"positions">>();
  for (const position of positions) {
    positionNames.set(position._id, position.nama);
    putIndex(positionIdByName, position.nama, position._id);
  }
  return { unitNames, positionNames, unitIdByName, positionIdByName };
}

/** Index both the normalised and the legacy exact-lower-case key. */
function putIndex<T>(index: Map<string, T>, nama: string, id: T): void {
  for (const key of [normalizeLookupKey(nama), nama.trim().toLowerCase()]) {
    if (key && !index.has(key)) index.set(key, id);
  }
}

/** Find a unit id for free text, tolerating spelling and punctuation drift. */
export function findUnit(
  maps: NameMaps,
  units: readonly { _id: Id<"organizationUnits">; nama: string }[],
  value: unknown,
): Id<"organizationUnits"> | undefined {
  const direct = maps.unitIdByName.get(normalizeLookupKey(value));
  return direct ?? findByName(units, value)?._id;
}

/** Find a position id for free text, tolerating spelling and punctuation drift. */
export function findPosition(
  maps: NameMaps,
  positions: readonly { _id: Id<"positions">; nama: string }[],
  value: unknown,
): Id<"positions"> | undefined {
  const direct = maps.positionIdByName.get(normalizeLookupKey(value));
  return direct ?? findByName(positions, value)?._id;
}

function slug(value: string): string {
  return normalizeLookupKey(value).replace(/\s+/g, "-");
}

/**
 * Return the unit id for free text, registering the unit when the Referensi
 * table has never heard of it. Importing must never silently drop a placement.
 */
export async function ensureUnit(
  ctx: MutationCtx,
  nama: unknown,
): Promise<Id<"organizationUnits"> | null> {
  const trimmed = String(nama ?? "").trim();
  if (!trimmed) return null;
  const units = await ctx.db.query("organizationUnits").collect();
  const existing = findByName(units, trimmed);
  if (existing) return existing._id;
  const now = Date.now();
  return ctx.db.insert("organizationUnits", {
    kode: `U-${slug(trimmed)}`,
    nama: trimmed,
    type: "BIDANG",
    keterangan: "Dibuat otomatis dari master data karyawan saat import",
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

/** Same as {@link ensureUnit} for jabatan (positions). */
export async function ensurePosition(
  ctx: MutationCtx,
  nama: unknown,
  unitId?: Id<"organizationUnits"> | undefined,
): Promise<Id<"positions"> | null> {
  const trimmed = String(nama ?? "").trim();
  if (!trimmed) return null;
  const positions = await ctx.db.query("positions").collect();
  const existing = findByName(positions, trimmed);
  if (existing) return existing._id;
  const now = Date.now();
  return ctx.db.insert("positions", {
    kode: `P-${slug(trimmed)}`,
    nama: trimmed.toUpperCase(),
    level: "PELAKSANA",
    isStructural: false,
    unitId,
    keterangan: "Dibuat otomatis dari master data karyawan saat import",
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

export function unitName(
  maps: NameMaps,
  id: Id<"organizationUnits"> | undefined,
): string | undefined {
  return id ? maps.unitNames.get(id) : undefined;
}

export function positionName(
  maps: NameMaps,
  id: Id<"positions"> | undefined,
): string | undefined {
  return id ? maps.positionNames.get(id) : undefined;
}