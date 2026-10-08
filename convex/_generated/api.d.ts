/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attendance from "../attendance.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as backup from "../backup.js";
import type * as benefits from "../benefits.js";
import type * as bootReports from "../bootReports.js";
import type * as contracts from "../contracts.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as education from "../education.js";
import type * as employeeWrites from "../employeeWrites.js";
import type * as employees from "../employees.js";
import type * as importEmployees from "../importEmployees.js";
import type * as leave from "../leave.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_employeeQuery from "../lib/employeeQuery.js";
import type * as lib_employeeRepository from "../lib/employeeRepository.js";
import type * as lib_mailer from "../lib/mailer.js";
import type * as lib_names from "../lib/names.js";
import type * as lib_placementBackfill from "../lib/placementBackfill.js";
import type * as lib_sessionJwt from "../lib/sessionJwt.js";
import type * as lifecycle from "../lifecycle.js";
import type * as mail from "../mail.js";
import type * as notifications from "../notifications.js";
import type * as organization from "../organization.js";
import type * as payroll from "../payroll.js";
import type * as performance from "../performance.js";
import type * as reports from "../reports.js";
import type * as restore from "../restore.js";
import type * as seed from "../seed.js";
import type * as selfService from "../selfService.js";
import type * as storage from "../storage.js";
import type * as trainings from "../trainings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attendance: typeof attendance;
  audit: typeof audit;
  auth: typeof auth;
  backup: typeof backup;
  benefits: typeof benefits;
  bootReports: typeof bootReports;
  contracts: typeof contracts;
  crons: typeof crons;
  dashboard: typeof dashboard;
  education: typeof education;
  employeeWrites: typeof employeeWrites;
  employees: typeof employees;
  importEmployees: typeof importEmployees;
  leave: typeof leave;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/employeeQuery": typeof lib_employeeQuery;
  "lib/employeeRepository": typeof lib_employeeRepository;
  "lib/mailer": typeof lib_mailer;
  "lib/names": typeof lib_names;
  "lib/placementBackfill": typeof lib_placementBackfill;
  "lib/sessionJwt": typeof lib_sessionJwt;
  lifecycle: typeof lifecycle;
  mail: typeof mail;
  notifications: typeof notifications;
  organization: typeof organization;
  payroll: typeof payroll;
  performance: typeof performance;
  reports: typeof reports;
  restore: typeof restore;
  seed: typeof seed;
  selfService: typeof selfService;
  storage: typeof storage;
  trainings: typeof trainings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
