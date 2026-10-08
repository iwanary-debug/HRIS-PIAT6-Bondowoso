/**
 * Contract & SK module — contract history, renewals and the
 * "Kontrak Akan Berakhir" dashboard.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PERMISSIONS } from "../src/domain/permissions";
import {
  CONTRACT_TYPE,
  evaluateContractStatus,
  parseContractDurationToDays,
} from "../src/domain/contract";
import { calculateTenure, toISODate } from "../src/domain/tenure";
import { requirePermission, requireUser } from "./lib/auth";
import { AUDIT_ACTION, writeAudit } from "./lib/audit";
import { loadNameMaps, positionName } from "./lib/names";

function nextNomor(existing: string[], prefix = "SK/KTR"): string {
  const year = new Date().getFullYear();
  const sameYear = existing.filter((n) => n.includes(`/${year}`));
  return `${prefix}/${year}/${String(sameYear.length + 1).padStart(4, "0")}`;
}

export const list = query({
  args: {
    status: v.optional(v.string()),
    type: v.optional(v.string()),
    bidangId: v.optional(v.id("organizationUnits")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const contracts = await ctx.db.query("contracts").collect();
    const employees = await ctx.db.query("employees").collect();
    const maps = await loadNameMaps(ctx);
    const employeeById = new Map(employees.map((e) => [e._id, e]));

    const rows = contracts
      .filter((c) => (args.status ? c.status === args.status : true))
      .filter((c) => (args.type ? c.type === args.type : true))
      .filter((c) => {
        const employee = employeeById.get(c.employeeId);
        if (!employee) return false;
        if (args.bidangId && employee.bidangId !== args.bidangId) return false;
        return true;
      })
      .map((contract) => {
        const employee = employeeById.get(contract.employeeId);
        const evaluation = evaluateContractStatus(contract.selesai);
        return {
          id: contract._id,
          nomor: contract.nomor,
          type: contract.type,
          mulai: contract.mulai,
          selesai: contract.selesai,
          durasi: contract.durasi,
          status: contract.status,
          notes: contract.notes,
          skDocumentId: contract.skDocumentId,
          employee: employee
            ? {
                id: employee._id,
                namaLengkap: employee.namaLengkap,
                niy: employee.niy,
                status: employee.status,
                jabatan: positionName(maps, employee.jabatanId),
              }
            : null,
          contractStatus: evaluation.status,
          daysRemaining: evaluation.daysRemaining,
        };
      })
      .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999));

    return args.limit ? rows.slice(0, args.limit) : rows;
  },
});

/** Contract health board with the four spec indicators. */
export const expiringBoard = query({
  args: { bidangId: v.optional(v.id("organizationUnits")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [contracts, employees, units] = await Promise.all([
      ctx.db.query("contracts").collect(),
      ctx.db.query("employees").collect(),
      ctx.db.query("organizationUnits").collect(),
    ]);
    const maps = await loadNameMaps(ctx);
    const employeeById = new Map(employees.map((e) => [e._id, e]));
    const unitName = new Map(units.map((u) => [u._id, u.nama]));

    const counts = { AMAN: 0, MENDEKAT: 0, PERLU_TINDAKAN: 0, LEWAT: 0 };
    const rows: {
      contractId: string;
      employeeId: string;
      namaLengkap: string;
      niy: string;
      bidang?: string;
      jabatan?: string;
      nomor: string;
      type: string;
      selesai?: string;
      status: string;
      daysRemaining: number | null;
    }[] = [];

    for (const contract of contracts) {
      if (contract.status !== "AKTIF") continue;
      const employee = employeeById.get(contract.employeeId);
      if (!employee || employee.status !== "AKTIF") continue;
      if (args.bidangId && employee.bidangId !== args.bidangId) continue;
      const evaluation = evaluateContractStatus(contract.selesai);
      counts[evaluation.status] += 1;
      if (evaluation.status === "AMAN") continue;
      rows.push({
        contractId: contract._id,
        employeeId: employee._id,
        namaLengkap: employee.namaLengkap,
        niy: employee.niy,
        bidang: employee.bidangId ? unitName.get(employee.bidangId) : undefined,
        jabatan: positionName(maps, employee.jabatanId),
        nomor: contract.nomor,
        type: contract.type,
        selesai: contract.selesai,
        status: evaluation.status,
        daysRemaining: evaluation.daysRemaining,
      });
    }
    rows.sort((a, b) => (a.daysRemaining ?? -1) - (b.daysRemaining ?? -1));
    return { counts, rows };
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("contracts")),
    employeeId: v.id("employees"),
    nomor: v.optional(v.string()),
    type: v.string(),
    mulai: v.string(),
    selesai: v.optional(v.union(v.string(), v.null())),
    durasi: v.optional(v.string()),
    status: v.optional(v.string()),
    skDocumentId: v.optional(v.union(v.id("documents"), v.null())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_CONTRACT_EDIT);
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("KARYAWAN_NOT_FOUND");
    if (!Object.values(CONTRACT_TYPE).includes(args.type as never)) {
      throw new Error("JENIS_KONTRAK_INVALID");
    }
    if (args.selesai && args.selesai < args.mulai) {
      throw new Error("Tanggal berakhir kontrak tidak boleh sebelum tanggal mulai");
    }
    if (args.type === CONTRACT_TYPE.PKWTT && args.selesai) {
      throw new Error("Kontrak PKWTT tidak memiliki tanggal berakhir");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("contracts")
      .withIndex("employeeId", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    if (args.id) {
      const current = await ctx.db.get(args.id);
      if (!current) throw new Error("NOT_FOUND");
      await ctx.db.patch(args.id, {
        nomor: args.nomor ?? current.nomor,
        type: args.type,
        mulai: args.mulai,
        selesai: args.selesai ?? undefined,
        durasi: args.durasi ?? undefined,
        status: args.status ?? current.status,
        skDocumentId: args.skDocumentId ?? current.skDocumentId,
        notes: args.notes ?? current.notes,
        updatedAt: now,
      });
      await writeAudit(ctx, user, {
        action: AUDIT_ACTION.UPDATE,
        entity: "contract",
        recordId: args.id,
        summary: `Kontrak ${args.nomor ?? current.nomor} (${employee.namaLengkap}) diperbarui`,
        fields: ["type", "mulai", "selesai", "durasi", "status"],
      });
      return { id: args.id };
    }

    // Only one active contract per employee: supersede the previous one.
    for (const contract of existing) {
      if (contract.status === "AKTIF") {
        await ctx.db.patch(contract._id, { status: "SELESAI", updatedAt: now });
      }
    }
    const nomor = args.nomor ?? nextNomor(existing.map((c) => c.nomor));
    const id = await ctx.db.insert("contracts", {
      employeeId: args.employeeId,
      nomor,
      type: args.type,
      mulai: args.mulai,
      selesai: args.selesai ?? undefined,
      durasi: args.durasi ?? undefined,
      status: args.status ?? "AKTIF",
      skDocumentId: args.skDocumentId ?? undefined,
      notes: args.notes ?? undefined,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(employee._id, {
      statusAkad: args.type,
      durasiKontrak: args.durasi ?? undefined,
      jtPerpanjanganKontrak: args.selesai ?? undefined,
      tanggalBergabung: employee.tanggalBergabung ?? args.mulai,
      masaKerja: calculateTenure(employee.tanggalBergabung ?? args.mulai)?.label,
      updatedAt: now,
      updatedBy: user.id,
    });

    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "contract",
      recordId: id,
      summary: `Kontrak ${nomor} dibuat untuk ${employee.namaLengkap}`,
      metadata: { type: args.type, mulai: args.mulai, selesai: args.selesai ?? "-" },
    });
    return { id, nomor };
  },
});

/**
 * Renew a contract: closes the current one and creates the next period, with
 * the same duration by default. Keeps the full contract history.
 */
export const renew = mutation({
  args: { contractId: v.id("contracts"), durasi: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.HR_CONTRACT_EDIT);
    const current = await ctx.db.get(args.contractId);
    if (!current) throw new Error("NOT_FOUND");
    const now = Date.now();

    const durasi = args.durasi ?? current.durasi ?? "1 Tahun";
    const days = parseContractDurationToDays(durasi) ?? 365;
    const startSource = current.selesai ? new Date(`${current.selesai}T00:00:00`) : new Date(now);
    const mulai = toISODate(new Date(startSource.getTime() + 86_400_000));
    const selesai =
      current.type === CONTRACT_TYPE.PKWTT ? undefined : toISODate(new Date(new Date(`${mulai}T00:00:00`).getTime() + days * 86_400_000));

    await ctx.db.patch(current._id, { status: "SELESAI", updatedAt: now });

    const all = await ctx.db
      .query("contracts")
      .withIndex("employeeId", (q) => q.eq("employeeId", current.employeeId))
      .collect();
    const id = await ctx.db.insert("contracts", {
      employeeId: current.employeeId,
      nomor: nextNomor(all.map((c) => c.nomor)),
      type: current.type,
      mulai,
      selesai,
      durasi,
      status: "AKTIF",
      notes: `Perpanjangan kontrak ${current.nomor}`,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const employee = await ctx.db.get(current.employeeId);
    if (employee) {
      await ctx.db.patch(employee._id, {
        durasiKontrak: durasi,
        jtPerpanjanganKontrak: selesai,
        updatedAt: now,
        updatedBy: user.id,
      });
    }

    await writeAudit(ctx, user, {
      action: AUDIT_ACTION.CREATE,
      entity: "contract",
      recordId: id,
      summary: `Kontrak ${current.nomor} diperpanjang (${durasi})`,
      metadata: { dari: current.nomor, mulai, selesai: selesai ?? "-" },
    });
    return { id, mulai, selesai };
  },
});

export const history = query({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("employeeId", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    return contracts
      .sort((a, b) => b.mulai.localeCompare(a.mulai))
      .map((contract) => {
        const evaluation = evaluateContractStatus(contract.selesai);
        return {
          id: contract._id,
          nomor: contract.nomor,
          type: contract.type,
          mulai: contract.mulai,
          selesai: contract.selesai,
          durasi: contract.durasi,
          status: contract.status,
          notes: contract.notes,
          skDocumentId: contract.skDocumentId,
          contractStatus: evaluation.status,
          daysRemaining: evaluation.daysRemaining,
        };
      });
  },
});
