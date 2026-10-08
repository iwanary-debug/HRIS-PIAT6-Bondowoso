/**
 * Scheduled jobs.
 *
 * One job: a daily on-platform snapshot. It runs at 01:23 UTC (08:23 WIB) —
 * deliberately off the top of the hour, which is the busiest minute on the
 * clock, so the backup does not compete with real traffic.
 *
 * This is the safety net for mistakes inside the app (a bad import, an
 * accidental delete). It is NOT the archive: a file in Convex storage dies with
 * the project, so the Settings screen still asks the operator to download a copy.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "snapshot data harian",
  { hourUTC: 1, minuteUTC: 23 },
  internal.backup.cronSnapshot,
);

export default crons;