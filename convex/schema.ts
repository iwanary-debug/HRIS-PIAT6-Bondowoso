import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * HRIS PIAT6 data architecture.
 *
 * `employees` is the master. Every other domain references it by `_id`, so the
 * employee master can later become the shared SDM master of PIAT 6 Super App
 * without creating a second copy.
 *
 * Sensitive columns (NIK, BPJS, rekening, alamat, no HP) live here and are only
 * ever returned by functions that check HR_SENSITIVE_VIEW server-side.
 */

const timestamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
};

const domainTables = {
  // ── Identity & access ───────────────────────────────────────────────
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.string(),
    /** Optional link to the employee record for self-service roles. */
    employeeId: v.optional(v.id("employees")),
    /** Unit scope for UNIT_MANAGER role. */
    unitId: v.optional(v.id("organizationUnits")),
    active: v.boolean(),
    /** Set when an admin issues a temporary password; cleared on first change. */
    mustChangePassword: v.optional(v.boolean()),
    lastLoginAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("email", ["email"])
    .index("employeeId", ["employeeId"]),

  sessions: defineTable({
    tokenHash: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("tokenHash", ["tokenHash"])
    .index("userId", ["userId"]),

  // ── Organization ────────────────────────────────────────────────────
  organizationUnits: defineTable({
    kode: v.string(),
    nama: v.string(),
    type: v.string(),
    parentId: v.optional(v.id("organizationUnits")),
    headPositionId: v.optional(v.id("positions")),
    keterangan: v.optional(v.string()),
    active: v.boolean(),
    ...timestamps,
  })
    .index("parentId", ["parentId"])
    .index("kode", ["kode"]),

  positions: defineTable({
    kode: v.string(),
    nama: v.string(),
    level: v.string(),
    isStructural: v.boolean(),
    reportsToPositionId: v.optional(v.id("positions")),
    unitId: v.optional(v.id("organizationUnits")),
    keterangan: v.optional(v.string()),
    active: v.boolean(),
    ...timestamps,
  })
    .index("unitId", ["unitId"])
    .index("nama", ["nama"]),

  positionAssignments: defineTable({
    employeeId: v.id("employees"),
    positionId: v.id("positions"),
    unitId: v.id("organizationUnits"),
    supervisorId: v.optional(v.id("employees")),
    isPrimary: v.boolean(),
    mulai: v.string(),
    selesai: v.optional(v.string()),
    alasan: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("employeeId", ["employeeId"])
    .index("positionId", ["positionId"])
    .index("unitId", ["unitId"])
    .index("supervisorId", ["supervisorId"]),

  // ── Employee master ─────────────────────────────────────────────────
  employees: defineTable({
    niy: v.string(),
    namaLengkap: v.string(),
    bidangId: v.optional(v.id("organizationUnits")),
    jabatanId: v.optional(v.id("positions")),
    tanggalLahir: v.optional(v.string()),
    tempatLahir: v.optional(v.string()),
    alamatKtp: v.optional(v.string()),
    nik: v.optional(v.string()),
    noHp: v.optional(v.string()),
    email: v.optional(v.string()),
    fotoUrl: v.optional(v.string()),
    tanggalBergabung: v.optional(v.string()),
    masaKerja: v.optional(v.string()),
    statusAkad: v.optional(v.string()),
    durasiKontrak: v.optional(v.string()),
    jtPerpanjanganKontrak: v.optional(v.string()),
    status: v.string(),
    tmtResign: v.optional(v.string()),
    bpjsKesehatanNumber: v.optional(v.string()),
    bank: v.optional(v.string()),
    noRekening: v.optional(v.string()),
    statusPernikahan: v.optional(v.string()),
    jumlahAnak: v.optional(v.number()),
    pendidikanTerakhir: v.optional(v.string()),
    universitas: v.optional(v.string()),
    jurusan: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    updatedBy: v.optional(v.id("users")),
    ...timestamps,
  })
    .index("niy", ["niy"])
    .index("namaLengkap", ["namaLengkap"])
    .index("status", ["status"])
    .index("bidangId", ["bidangId"])
    .index("jabatanId", ["jabatanId"])
    .index("jtPerpanjanganKontrak", ["jtPerpanjanganKontrak"]),

  // ── Contract & employment ───────────────────────────────────────────
  contracts: defineTable({
    employeeId: v.id("employees"),
    nomor: v.string(),
    type: v.string(),
    mulai: v.string(),
    selesai: v.optional(v.string()),
    durasi: v.optional(v.string()),
    status: v.string(),
    skDocumentId: v.optional(v.id("documents")),
    notes: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    ...timestamps,
  })
    .index("employeeId", ["employeeId"])
    .index("status", ["status"])
    .index("selesai", ["selesai"]),

  // ── Attendance ──────────────────────────────────────────────────────
  attendanceRecords: defineTable({
    employeeId: v.id("employees"),
    date: v.string(),
    status: v.string(),
    checkIn: v.optional(v.string()),
    checkOut: v.optional(v.string()),
    lateMinutes: v.optional(v.number()),
    overtimeMinutes: v.optional(v.number()),
    source: v.string(),
    deviceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    recordedBy: v.optional(v.id("users")),
    ...timestamps,
  })
    .index("employeeId", ["employeeId"])
    .index("date", ["date"])
    .index("employeeId_date", ["employeeId", "date"])
    .index("date_status", ["date", "status"]),

  // ── Leave ───────────────────────────────────────────────────────────
  leaveRequests: defineTable({
    employeeId: v.id("employees"),
    nomor: v.string(),
    type: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    totalDays: v.number(),
    reason: v.string(),
    attachmentDocumentId: v.optional(v.id("documents")),
    status: v.string(),
    requestedBy: v.id("users"),
    requestedAt: v.number(),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("employeeId", ["employeeId"])
    .index("status", ["status"])
    .index("startDate", ["startDate"]),

  leaveHistory: defineTable({
    leaveRequestId: v.id("leaveRequests"),
    fromStatus: v.optional(v.string()),
    toStatus: v.string(),
    actorId: v.id("users"),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("leaveRequestId", ["leaveRequestId"]),

  leaveBalances: defineTable({
    employeeId: v.id("employees"),
    year: v.number(),
    type: v.string(),
    entitled: v.number(),
    used: v.number(),
    notes: v.optional(v.string()),
  }).index("employeeId_year", ["employeeId", "year"]),

  // ── Payroll (foundation, fully configurable) ────────────────────────
  payrollComponents: defineTable({
    code: v.string(),
    name: v.string(),
    kind: v.string(),
    calculation: v.string(),
    value: v.number(),
    basedOnCode: v.optional(v.string()),
    taxable: v.boolean(),
    active: v.boolean(),
    description: v.optional(v.string()),
    order: v.number(),
    ...timestamps,
  })
    .index("code", ["code"])
    .index("active", ["active"]),

  salaryStructures: defineTable({
    employeeId: v.id("employees"),
    baseSalary: v.number(),
    effectiveDate: v.string(),
    notes: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    ...timestamps,
  }).index("employeeId", ["employeeId"]),

  payrollPeriods: defineTable({
    period: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    status: v.string(),
    description: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    ...timestamps,
  }).index("period", ["period"]),

  payslips: defineTable({
    periodId: v.id("payrollPeriods"),
    employeeId: v.id("employees"),
    baseSalary: v.number(),
    computation: v.any(),
    totalEarnings: v.number(),
    totalDeductions: v.number(),
    netPay: v.number(),
    status: v.string(),
    ...timestamps,
  })
    .index("periodId", ["periodId"])
    .index("employeeId", ["employeeId"])
    .index("periodId_employeeId", ["periodId", "employeeId"]),

  // ── Benefits ────────────────────────────────────────────────────────
  benefits: defineTable({
    employeeId: v.id("employees"),
    type: v.string(),
    provider: v.optional(v.string()),
    number: v.optional(v.string()),
    status: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    monthlyContribution: v.optional(v.number()),
    notes: v.optional(v.string()),
    ...timestamps,
  }).index("employeeId", ["employeeId"]),

  // ── Education & competency ──────────────────────────────────────────
  educationRecords: defineTable({
    employeeId: v.id("employees"),
    level: v.string(),
    institution: v.string(),
    major: v.optional(v.string()),
    graduationYear: v.optional(v.number()),
    isCurrent: v.boolean(),
    notes: v.optional(v.string()),
    ...timestamps,
  }).index("employeeId", ["employeeId"]),

  competencies: defineTable({
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    ...timestamps,
  }).index("category", ["category"]),

  employeeCompetencies: defineTable({
    employeeId: v.id("employees"),
    competencyId: v.id("competencies"),
    level: v.number(),
    certificationDocumentId: v.optional(v.id("documents")),
    assessedAt: v.string(),
    assessedBy: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    ...timestamps,
  })
    .index("employeeId", ["employeeId"])
    .index("competencyId", ["competencyId"]),

  // ── Training ────────────────────────────────────────────────────────
  trainings: defineTable({
    kode: v.string(),
    name: v.string(),
    type: v.string(),
    organizer: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    location: v.optional(v.string()),
    status: v.string(),
    cost: v.number(),
    outcomeCompetencies: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    ...timestamps,
  })
    .index("status", ["status"])
    .index("startDate", ["startDate"]),

  trainingParticipants: defineTable({
    trainingId: v.id("trainings"),
    employeeId: v.id("employees"),
    status: v.string(),
    certificateNumber: v.optional(v.string()),
    certificateDocumentId: v.optional(v.id("documents")),
    score: v.optional(v.number()),
    notes: v.optional(v.string()),
    ...timestamps,
  })
    .index("trainingId", ["trainingId"])
    .index("employeeId", ["employeeId"]),

  // ── Performance ─────────────────────────────────────────────────────
  performanceIndicators: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
    weight: v.number(),
    active: v.boolean(),
    ...timestamps,
  }).index("active", ["active"]),

  performanceAssessments: defineTable({
    employeeId: v.id("employees"),
    period: v.string(),
    status: v.string(),
    evaluatorId: v.optional(v.id("users")),
    finalScore: v.optional(v.number()),
    grade: v.optional(v.string()),
    summary: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("employeeId", ["employeeId"])
    .index("period", ["period"])
    .index("employeeId_period", ["employeeId", "period"]),

  performanceScores: defineTable({
    assessmentId: v.id("performanceAssessments"),
    indicatorId: v.id("performanceIndicators"),
    target: v.optional(v.number()),
    value: v.optional(v.number()),
    weight: v.optional(v.number()),
    score: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("assessmentId", ["assessmentId"])
    .index("indicatorId", ["indicatorId"]),

  // ── Discipline ──────────────────────────────────────────────────────
  disciplineRecords: defineTable({
    employeeId: v.id("employees"),
    incidentDate: v.string(),
    violationType: v.string(),
    description: v.string(),
    action: v.string(),
    status: v.string(),
    recordedBy: v.optional(v.id("users")),
    followUpDate: v.optional(v.string()),
    coachingNotes: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("employeeId", ["employeeId"])
    .index("status", ["status"])
    .index("incidentDate", ["incidentDate"]),

  // ── Documents (metadata; blobs in Convex file storage) ──────────────
  documents: defineTable({
    employeeId: v.optional(v.id("employees")),
    category: v.string(),
    name: v.string(),
    storageId: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    version: v.number(),
    status: v.string(),
    issuedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    uploadedBy: v.optional(v.id("users")),
    ...timestamps,
  })
    .index("employeeId", ["employeeId"])
    .index("category", ["category"])
    .index("employeeId_category", ["employeeId", "category"]),

  // ── Career lifecycle ────────────────────────────────────────────────
  mutations: defineTable({
    employeeId: v.id("employees"),
    type: v.string(),
    effectiveDate: v.string(),
    fromPositionId: v.optional(v.id("positions")),
    toPositionId: v.optional(v.id("positions")),
    fromUnitId: v.optional(v.id("organizationUnits")),
    toUnitId: v.optional(v.id("organizationUnits")),
    skDocumentId: v.optional(v.id("documents")),
    skNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("employeeId", ["employeeId"])
    .index("effectiveDate", ["effectiveDate"]),

  resignations: defineTable({
    employeeId: v.id("employees"),
    nomor: v.string(),
    type: v.string(),
    lastWorkingDate: v.string(),
    reason: v.string(),
    status: v.string(),
    clearances: v.array(
      v.object({
        item: v.string(),
        label: v.string(),
        cleared: v.boolean(),
        clearedBy: v.optional(v.string()),
        clearedAt: v.optional(v.number()),
        notes: v.optional(v.string()),
      }),
    ),
    documentId: v.optional(v.id("documents")),
    notes: v.optional(v.string()),
    requestedBy: v.optional(v.id("users")),
    completedAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("employeeId", ["employeeId"])
    .index("status", ["status"]),

  // ── Import ──────────────────────────────────────────────────────────
  importSessions: defineTable({
    filename: v.string(),
    sheet: v.optional(v.string()),
    headerRowIndex: v.number(),
    mapping: v.any(),
    duplicateRule: v.string(),
    createdBy: v.id("users"),
    status: v.string(),
    summary: v.any(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("createdBy", ["createdBy"])
    .index("status", ["status"]),

  // ── Governance ──────────────────────────────────────────────────────
  auditLogs: defineTable({
    actorId: v.optional(v.id("users")),
    actorName: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    action: v.string(),
    entity: v.string(),
    recordId: v.optional(v.string()),
    summary: v.string(),
    changes: v.optional(v.any()),
    metadata: v.optional(v.any()),
    ip: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("createdAt", ["createdAt"])
    .index("actorId", ["actorId"])
    .index("entity", ["entity"])
    .index("entity_recordId", ["entity", "recordId"])
    .index("action", ["action"]),

  /** Boot diagnostics: written by the index.html failsafe when the bundle dies. */
  bootReports: defineTable({
    message: v.string(),
    userAgent: v.optional(v.string()),
    url: v.optional(v.string()),
    createdAt: v.number(),
  }).index("createdAt", ["createdAt"]),

  settings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  }).index("key", ["key"]),

  /**
   * Scheduled snapshots kept in Convex file storage.
   *
   * This is a SECOND line of defence, not the primary archive: it protects
   * against a bad import or an accidental deletion inside the app, which is the
   * realistic daily risk. It does NOT survive the project being deleted — the
   * file would go with it — so the Settings screen still tells the operator to
   * download a copy off-platform. `importSessions` is intentionally excluded
   * from the snapshot content, but this table is an internal ledger and keeps
   * only metadata, never employee data.
   */
  backupSnapshots: defineTable({
    /** Convex file id of the JSON payload. */
    storageId: v.id("_storage"),
    filename: v.string(),
    /** "safe" drops NIK/BPJS/rekening; "full" keeps them. */
    mode: v.string(),
    totalRows: v.number(),
    counts: v.any(),
    sizeBytes: v.optional(v.number()),
    /** "CRON" or "MANUAL" — so an operator can tell routine from ad-hoc runs. */
    trigger: v.string(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("createdAt", ["createdAt"])
    .index("trigger", ["trigger"]),
};

export default defineSchema(domainTables);
