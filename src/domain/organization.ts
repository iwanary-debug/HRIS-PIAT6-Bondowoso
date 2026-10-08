/**
 * Organization domain — units (bidang) and positions (jabatan).
 * Seeded from `reference/bidang-reference.csv` and
 * `reference/jabatan-reference.csv` so the source structure is preserved.
 */

export const ORG_UNIT_TYPE = {
  BIDANG: "BIDANG",
  SUB_UNIT: "SUB_UNIT",
} as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPE)[keyof typeof ORG_UNIT_TYPE];

export interface OrganizationUnit {
  _id: string;
  kode: string;
  nama: string;
  type: OrgUnitType;
  parentId?: string;
  /** Position that heads this unit, if any. */
  headPositionId?: string;
  keterangan?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export const POSITION_LEVEL = {
  STRUKTURAL: "STRUKTURAL",
  PELAKSANA: "PELAKSANA",
  TEKNIS: "TEKNIS",
  NON_PELAKSANA: "NON_PELAKSANA",
} as const;
export type PositionLevel = (typeof POSITION_LEVEL)[keyof typeof POSITION_LEVEL];

export const POSITION_LEVEL_LABELS: Record<PositionLevel, string> = {
  STRUKTURAL: "Struktural",
  PELAKSANA: "Pelaksana",
  TEKNIS: "Teknis",
  NON_PELAKSANA: "Non Pelaksana",
};

export interface Position {
  _id: string;
  kode: string;
  nama: string;
  level: PositionLevel;
  /** Structural positions belong to the org chart. */
  isStructural: boolean;
  /** Reports-to position, for the organisation chart. */
  reportsToPositionId?: string;
  unitId?: string;
  keterangan?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PositionAssignment {
  _id: string;
  employeeId: string;
  positionId: string;
  unitId: string;
  /** Who supervised this employee in this position. */
  supervisorId?: string;
  isPrimary: boolean;
  mulai: string;
  selesai?: string;
  alasan?: string;
  createdAt: number;
}

export interface OrgNode {
  unit?: OrganizationUnit;
  position?: Position;
  holder?: { _id: string; namaLengkap: string; niy: string };
  children: OrgNode[];
}

/** Reference lists shipped in the repository (fictional seed data). */
export const REFERENCED_BIDANG = [
  "Mudir",
  "Madrasah",
  "Kepengasuhan",
  "Keuangan SDM",
  "Rumah Tangga",
] as const;

export const REFERENCED_JABATAN = [
  "MUDIR",
  "KABID. RUMAH TANGGA",
  "KAMAD IM",
  "KAMAD. MTW",
  "KABID. KEPENGASUHAN",
  "KABID. KEUANGAN & SDM",
  "WAKA KURIKULUM IM",
  "WAKA KURIKULUM MTW",
  "SEKRETARIS MUDIR",
  "WAKA. KESISWAAN",
  "GURU SYARIAH",
  "GURU UMUM",
  "STAF TU & OPERATOR",
  "KASIR",
  "STAF MEDIA",
  "STAF HUMAS & IT",
  "STAF KEUANGAN & AKUNTANSI",
  "STAF SDM",
  "STAF UNIT USAHA",
  "STAF RUMAH TANGGA",
  "PERAWAT UKS",
  "STAF EKSKUL DAN LOMBA",
  "STAF ADM KEPENGASUHAN",
  "STAF BAHASA",
  "KOORDINATOR ASRAMA",
  "BK SANTRI",
  "STAF TIBSAN",
  "STAF TAHFIDZ",
  "STAF JT & KEGIATAN",
  "MUSYRIF",
  "SATPAM",
  "JURU MASAK",
  "SARDAP",
  "CLEANING SERVICE",
  "KARY. UNIT USAHA",
] as const;

/**
 * Canonical key for matching a bidang/jabatan name.
 *
 * The workbook feeds free text ("KABID. RUMAH TANGGA ", "STAF HUMAS & IT")
 * while the Referensi table is typed by hand, so case, punctuation and spacing
 * are normalised away. A cosmetic difference must never drop a placement — that
 * is how an entire import once ended up with empty bidang and jabatan.
 */
export function normalizeLookupKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .toLowerCase()
    .replace(/[.,;:/\\()[\]{}'"`|_]+/g, " ")
    .replace(/&/g, " dan ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minimum token-overlap confidence before a fuzzy match is trusted. */
const FUZZY_THRESHOLD = 0.6;

/** Token-overlap score in [0,1]; 1 means the key is identical. */
function tokenScore(key: string, candidate: string): number {
  if (key === candidate) return 1;
  const keyTokens = key.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  if (keyTokens.length === 0 || candidateTokens.length === 0) return 0;
  let shared = 0;
  for (const token of keyTokens) {
    if (candidateTokens.some((other) => other.startsWith(token) || token.startsWith(other))) {
      shared += 1;
    }
  }
  if (shared === 0) return 0;
  const overlap = shared / Math.max(keyTokens.length, candidateTokens.length);
  const union = new Set([...keyTokens, ...candidateTokens]).size;
  return Math.max(overlap, shared / union);
}

interface Named {
  nama: string;
}

/**
 * Resolve free text to one of `items` by name: exact normalised key first, then
 * the single closest fuzzy candidate. Near-ties are treated as ambiguous and
 * left unresolved rather than guessed, so nothing is silently mis-assigned.
 */
export function findByName<T extends Named>(
  items: readonly T[],
  value: unknown,
): T | undefined {
  const key = normalizeLookupKey(value);
  if (!key) return undefined;
  const candidates = new Map<string, T>();
  for (const item of items) {
    const itemKey = normalizeLookupKey(item.nama);
    if (itemKey && !candidates.has(itemKey)) candidates.set(itemKey, item);
  }
  const exact = candidates.get(key);
  if (exact) return exact;

  let bestScore = 0;
  let best: T | undefined;
  let tied = false;
  for (const [candidateKey, item] of candidates) {
    const score = tokenScore(key, candidateKey);
    if (score > bestScore) {
      bestScore = score;
      best = item;
      tied = false;
    } else if (best && score >= bestScore - 1e-9) {
      tied = true;
    }
  }
  return bestScore >= FUZZY_THRESHOLD && !tied ? best : undefined;
}
