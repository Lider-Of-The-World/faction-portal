import type { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";

export type AuditCategory =
  | "accounts"
  | "events"
  | "standards"
  | "tasks"
  | "discipline";

export type AuditInput = {
  actorId: string;
  actorNickname: string;
  category: AuditCategory;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  targetMemberId?: string | null;
  targetMemberNickname?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
};

type AuditExecutor = Pick<typeof db, "insert">;

/**
 * Call from the same PostgreSQL transaction as the action being audited.
 * There are intentionally no update/delete helpers or HTTP write endpoints.
 */
export async function writeAudit(
  executor: AuditExecutor,
  event: AuditInput,
): Promise<void> {
  await executor.insert(auditLogsTable).values({
    actorId: event.actorId,
    actorNickname: event.actorNickname,
    category: event.category,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    entityLabel: event.entityLabel,
    targetMemberId: event.targetMemberId ?? null,
    targetMemberNickname: event.targetMemberNickname ?? null,
    reason: event.reason ?? null,
    details: event.details ?? {},
  });
}
