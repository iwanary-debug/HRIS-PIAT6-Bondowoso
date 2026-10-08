/**
 * Employee list filtering / sorting. Kept out of the Convex function file so it
 * can be unit tested and reused by report endpoints.
 */

import { calculateTenure } from "../../src/domain/tenure";
import type { Doc } from "../_generated/dataModel";

export interface EmployeeFilters {
  search?: string;
  status?: string[];
  bidangId?: string[];
  jabatanId?: string[];
  statusAkad?: string[];
  masaKerjaMin?: number;
  includeInactive?: boolean;
  unitIdByName: Map<string, string>;
  positionIdByName: Map<string, string>;
  unitNames: Map<string, string>;
  positionNames: Map<string, string>;
  scopedUnitId?: string;
  scopeEmployeeId?: string;
}

type EmployeeDoc = Doc<"employees">;

export function resolveUnitId(employee: EmployeeDoc): string | undefined {
  return employee.bidangId;
}

/** Employee fields a user can search by (never NIK / BPJS / rekening). */
function searchHaystack(employee: EmployeeDoc, filters: EmployeeFilters): string {
  const bidang = employee.bidangId ? filters.unitNames.get(employee.bidangId) : undefined;
  const jabatan = employee.jabatanId ? filters.positionNames.get(employee.jabatanId) : undefined;
  return [employee.niy, employee.namaLengkap, bidang, jabatan, employee.noHp, employee.email]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function buildEmployeeQuery(
  documents: readonly EmployeeDoc[],
  filters: EmployeeFilters,
): EmployeeDoc[] {
  const term = filters.search?.trim().toLowerCase();
  const statusSet = filters.status?.length ? new Set(filters.status) : null;
  const bidangSet = filters.bidangId?.length ? new Set(filters.bidangId) : null;
  const jabatanSet = filters.jabatanId?.length ? new Set(filters.jabatanId) : null;
  const akadSet = filters.statusAkad?.length ? new Set(filters.statusAkad) : null;

  return documents.filter((employee) => {
    if (!filters.includeInactive && employee.status !== "AKTIF") return false;
    if (filters.scopeEmployeeId && employee._id !== filters.scopeEmployeeId) return false;
    if (filters.scopedUnitId && employee.bidangId !== filters.scopedUnitId) return false;
    if (statusSet && !statusSet.has(employee.status)) return false;
    if (bidangSet && (!employee.bidangId || !bidangSet.has(employee.bidangId))) return false;
    if (jabatanSet && (!employee.jabatanId || !jabatanSet.has(employee.jabatanId))) return false;
    if (akadSet && (!employee.statusAkad || !akadSet.has(employee.statusAkad))) return false;
    if (filters.masaKerjaMin) {
      const tenure = calculateTenure(employee.tanggalBergabung);
      if (!tenure || tenure.totalMonths < filters.masaKerjaMin) return false;
    }
    if (term && !searchHaystack(employee, filters).includes(term)) return false;
    return true;
  });
}

export const EMPLOYEE_SORT_FIELDS = [
  "niy",
  "namaLengkap",
  "bidang",
  "jabatan",
  "status",
  "statusAkad",
  "masaKerja",
] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export function sortEmployees(
  rows: EmployeeDoc[],
  sortBy: string,
  sortDir: "asc" | "desc",
  filters: Pick<EmployeeFilters, "unitNames" | "positionNames">,
): EmployeeDoc[] {
  const direction = sortDir === "desc" ? -1 : 1;
  const value = (employee: EmployeeDoc): string | number => {
    switch (sortBy) {
      case "bidang":
        return (employee.bidangId ? filters.unitNames.get(employee.bidangId) : "") ?? "";
      case "jabatan":
        return (employee.jabatanId ? filters.positionNames.get(employee.jabatanId) : "") ?? "";
      case "masaKerja": {
        const tenure = calculateTenure(employee.tanggalBergabung);
        return tenure?.totalMonths ?? -1;
      }
      case "namaLengkap":
        return employee.namaLengkap;
      case "status":
        return employee.status;
      case "statusAkad":
        return employee.statusAkad ?? "";
      default:
        return employee.niy;
    }
  };
  return rows.sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * direction;
    }
    return String(left).localeCompare(String(right), "id") * direction;
  });
}

/** Case-insensitive unique match of a bidang/jabatan name to its id. */
export function findUnitIdByName(
  name: string | undefined,
  map: Map<string, string>,
): string | undefined {
  if (!name) return undefined;
  return map.get(name.trim().toLowerCase());
}
