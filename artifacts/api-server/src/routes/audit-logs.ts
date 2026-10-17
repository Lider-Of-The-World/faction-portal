import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ListAuditLogsResponse } from "@workspace/api-zod";
import { auditLogsTable, db } from "@workspace/db";
import { requireManager, requireReadyAuth } from "../lib/auth";

const router: IRouter = Router();
const categories = new Set([
  "accounts",
  "events",
  "standards",
  "tasks",
  "discipline",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readQueryString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

router.get(
  "/audit-logs",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const category = readQueryString(req.query.category);
    const actorId = readQueryString(req.query.actorId);
    const memberId = readQueryString(req.query.memberId);
    const rawAction = readQueryString(req.query.action);
    const action =
      rawAction === null || rawAction === undefined
        ? rawAction
        : rawAction.trim();
    const from = readQueryString(req.query.from);
    const to = readQueryString(req.query.to);
    const rawLimit = readQueryString(req.query.limit);
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (
      category === null ||
      (category !== undefined && !categories.has(category)) ||
      actorId === null ||
      (actorId !== undefined && !uuidPattern.test(actorId)) ||
      memberId === null ||
      (memberId !== undefined && !uuidPattern.test(memberId)) ||
      action === null ||
      (action !== undefined && action.length > 100) ||
      from === null ||
      (fromDate && Number.isNaN(fromDate.getTime())) ||
      to === null ||
      (toDate && Number.isNaN(toDate.getTime())) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200 ||
      (fromDate && toDate && fromDate > toDate)
    ) {
      res.status(400).json({ error: "Проверьте фильтры журнала действий." });
      return;
    }

    const conditions = [];
    if (category) {
      conditions.push(eq(auditLogsTable.category, category));
    }
    if (actorId) {
      conditions.push(eq(auditLogsTable.actorId, actorId));
    }
    if (memberId) {
      conditions.push(eq(auditLogsTable.targetMemberId, memberId));
    }
    if (action) {
      conditions.push(
        or(
          ilike(auditLogsTable.action, `%${action}%`),
          ilike(auditLogsTable.entityLabel, `%${action}%`),
        )!,
      );
    }
    if (fromDate) {
      conditions.push(gte(auditLogsTable.createdAt, fromDate));
    }
    if (toDate) {
      conditions.push(lte(auditLogsTable.createdAt, toDate));
    }

    const rows = await db
      .select()
      .from(auditLogsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit);
    res.json(ListAuditLogsResponse.parse(rows));
  },
);

export default router;
