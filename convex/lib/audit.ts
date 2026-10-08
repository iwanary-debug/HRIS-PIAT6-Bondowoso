/**
 * Audit trail writer.
 * Every critical mutation routes through `writeAudit` so who/what/when is
 * always recorded. Raw sensitive values never reach the log — see
 * `diffFields` in src/domain/audit.ts.
 */

import type { MutationCtx } from "../_generated/server";
import {
  AUDIT_ACTION,
  type AuditAction,
  type FieldChange,
  diffFields,
} from "../../src/domain/audit";
import type { AuthenticatedUser } from "./auth";

export interface AuditInput {
  action: AuditAction;
  entity: string;
  recordId?: string;
  summary: string;
  changes?: FieldChange[];
  metadata?: Record<string, string | number | boolean | null>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fields?: readonly string[];
}

export async function writeAudit(
  ctx: MutationCtx,
  user: AuthenticatedUser | null,
  input: AuditInput,
): Promise<void> {
  const changes =
    input.changes ??
    (input.before && input.after && input.fields
      ? diffFields(input.before, input.after, input.fields)
      : undefined);

  await ctx.db.insert("auditLogs", {
    actorId: user?.id,
    actorName: user?.name,
    actorEmail: user?.email,
    action: input.action,
    entity: input.entity,
    recordId: input.recordId,
    summary: input.summary.slice(0, 500),
    changes,
    metadata: input.metadata,
    createdAt: Date.now(),
  });
}

export { AUDIT_ACTION };
export type { AuditAction };
