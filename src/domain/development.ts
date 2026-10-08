/**
 * Development domain — education history, competency, training and performance.
 * History is first-class: the workbook's three flat columns (Pendidikan
 * Terakhir / Universitas / Jurusan) seed the first EducationRecord only.
 */

export const EDUCATION_LEVEL = {
  SD_SMP: "SD/SMP",
  SMA_SMK: "SMA/SMK",
  D1_D2_D3: "D1/D2/D3",
  S1: "S1",
  S2: "S2",
  S3: "S3",
} as const;
export type EducationLevel = (typeof EDUCATION_LEVEL)[keyof typeof EDUCATION_LEVEL];

export const EDUCATION_LEVEL_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: "SD/SMP", label: "SD / SMP" },
  { value: "SMA/SMK", label: "SMA / SMK" },
  { value: "D1/D2/D3", label: "D1 / D2 / D3" },
  { value: "S1", label: "S1 (Sarjana)" },
  { value: "S2", label: "S2 (Magister)" },
  { value: "S3", label: "S3 (Doktor)" },
];

export interface EducationRecord {
  _id: string;
  employeeId: string;
  level: EducationLevel;
  institution: string;
  major?: string;
  graduationYear?: number;
  /** True for the employee's most recent / highest record. */
  isCurrent: boolean;
  notes?: string;
  createdAt: number;
}

export const COMPETENCY_LEVEL = {
  BEGINNER: 1,
  BASIC: 2,
  INTERMEDIATE: 3,
  ADVANCED: 4,
  EXPERT: 5,
} as const;
export type CompetencyLevel = (typeof COMPETENCY_LEVEL)[keyof typeof COMPETENCY_LEVEL];

export const COMPETENCY_LEVEL_LABELS: Record<number, string> = {
  1: "Pemula",
  2: "Dasar",
  3: "Menengah",
  4: "Mahir",
  5: "Ahli",
};

export interface Competency {
  _id: string;
  name: string;
  category: string;
  description?: string;
  active: boolean;
}

export interface EmployeeCompetency {
  _id: string;
  employeeId: string;
  competencyId: string;
  competencyName?: string;
  category?: string;
  level: number;
  /** Set when a certification backs this competency. */
  certificationDocumentId?: string;
  assessedAt: string;
  assessedBy?: string;
  notes?: string;
}

export const TRAINING_STATUS = {
  PLANNED: "PLANNED",
  ONGOING: "ONGOING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type TrainingStatus = (typeof TRAINING_STATUS)[keyof typeof TRAINING_STATUS];

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  PLANNED: "Direncanakan",
  ONGOING: "Berlangsung",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

export interface Training {
  _id: string;
  kode: string;
  name: string;
  type: string;
  organizer: string;
  startDate: string;
  endDate: string;
  location?: string;
  status: TrainingStatus;
  cost: number;
  /** Competencies gained by the event, as free codes. */
  outcomeCompetencies: string[];
  certificateTemplateDocumentId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingParticipant {
  _id: string;
  trainingId: string;
  employeeId: string;
  status: TrainingStatus;
  certificateNumber?: string;
  certificateDocumentId?: string;
  score?: number;
  notes?: string;
  createdAt: number;
}

export const PERFORMANCE_INDICATOR_TYPE = {
  NUMERIC: "NUMERIC",
  PERCENTAGE: "PERCENTAGE",
  BOOLEAN: "BOOLEAN",
  SCORE: "SCORE",
} as const;
export type PerformanceIndicatorType =
  (typeof PERFORMANCE_INDICATOR_TYPE)[keyof typeof PERFORMANCE_INDICATOR_TYPE];

export interface PerformanceIndicator {
  _id: string;
  name: string;
  description?: string;
  type: PerformanceIndicatorType;
  weight: number;
  active: boolean;
}

export interface PerformanceAssessment {
  _id: string;
  employeeId: string;
  period: string; // yyyy-mm
  status: "DRAFT" | "SUBMITTED" | "FINALIZED";
  evaluatorId?: string;
  evaluatorName?: string;
  finalScore?: number;
  grade?: string;
  summary?: string;
  submittedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PerformanceScore {
  _id: string;
  assessmentId: string;
  indicatorId: string;
  indicatorName?: string;
  target?: number;
  value?: number;
  weight?: number;
  score?: number;
  notes?: string;
}

export function computePerformanceScore(
  scores: readonly { score?: number; weight?: number }[],
): number | null {
  let total = 0;
  let totalWeight = 0;
  for (const score of scores) {
    if (score.score === undefined || score.weight === undefined) continue;
    total += score.score * score.weight;
    totalWeight += score.weight;
  }
  if (totalWeight === 0) return null;
  return Math.round((total / totalWeight) * 100) / 100;
}

export const PERFORMANCE_GRADE_BANDS = [
  { min: 90, grade: "Sangat Baik" },
  { min: 80, grade: "Baik" },
  { min: 70, grade: "Cukup" },
  { min: 60, grade: "Perlu Pembinaan" },
  { min: 0, grade: "Perlu Pembinaan" },
] as const;

export function performanceGrade(score: number | null): string | null {
  if (score === null) return null;
  return PERFORMANCE_GRADE_BANDS.find((band) => score >= band.min)?.grade ?? null;
}

export const DISCIPLINE_VIOLATION_TYPE = {
  TERLAMBAT: "TERLAMBAT",
  TIDAK_HADIR: "TIDAK_HADIR",
  PEMALUAN: "PEMALUAN",
  KECELAKAAAN: "KECELAKAAAN",
  KETIDAKDISIPLINAN: "KETIDAKDISIPLINAN",
  PELANGGARAN_TATA_TERTIB: "PELANGGARAN_TATA_TERTIB",
  LAINNYA: "LAINNYA",
} as const;
export type DisciplineViolationType =
  (typeof DISCIPLINE_VIOLATION_TYPE)[keyof typeof DISCIPLINE_VIOLATION_TYPE];

export const DISCIPLINE_ACTION = {
  CATATAN: "CATATAN",
  PEMBINAAN: "PEMBINAAN",
  SP1: "SP1",
  SP2: "SP2",
  SP3: "SP3",
  PENGGANTUNGAN: "PENGGANTUNGAN",
  PEMUTUSAN: "PEMUTUSAN",
} as const;
export type DisciplineAction = (typeof DISCIPLINE_ACTION)[keyof typeof DISCIPLINE_ACTION];

export const DISCIPLINE_STATUS = {
  OPEN: "OPEN",
  IN_FOLLOW_UP: "IN_FOLLOW_UP",
  RESOLVED: "RESOLVED",
} as const;
export type DisciplineStatus = (typeof DISCIPLINE_STATUS)[keyof typeof DISCIPLINE_STATUS];

export const DISCIPLINE_STATUS_LABELS: Record<DisciplineStatus, string> = {
  OPEN: "Terbuka",
  IN_FOLLOW_UP: "Dalam Tindak Lanjut",
  RESOLVED: "Selesai",
};

export interface DisciplineRecord {
  _id: string;
  employeeId: string;
  incidentDate: string;
  violationType: DisciplineViolationType;
  description: string;
  action: DisciplineAction;
  status: DisciplineStatus;
  recordedBy?: string;
  followUpDate?: string;
  coachingNotes?: string;
  resolvedAt?: number;
  createdAt: number;
  updatedAt: number;
}
