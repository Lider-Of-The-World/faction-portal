import { and, asc, eq, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, membersTable } from "@workspace/db";
import { requireManager, requireReadyAuth } from "../lib/auth";
import { recordPointChange } from "../lib/points";
import { pointsDeductionDelta } from "../lib/points-rules";

const router: IRouter = Router();
const pointMemberParams = z.object({ memberId: z.string().uuid() });
const pointDeductionBody = z.object({
  amount: z.number().int().min(1).max(1000000),
  reason: z.string().trim().min(3).max(400),
});

router.get("/points", requireReadyAuth, async (req, res): Promise<void> => {
  const viewer = req.factionUser!;
  const rows = viewer.role === "employee"
    ? await db
        .select({ memberId: membersTable.id, points: membersTable.points })
        .from(membersTable)
        .where(eq(membersTable.id, viewer.id))
        .limit(1)
    : await db
        .select({ memberId: membersTable.id, points: membersTable.points })
        .from(membersTable)
        .where(and(eq(membersTable.role, "employee"), ne(membersTable.status, "removed")))
        .orderBy(asc(membersTable.nickname));
  res.json(rows.map((row) => ({ memberId: row.memberId, points: row.points })));
});

router.post("/points/:memberId/deduct", requireReadyAuth, async (req, res): Promise<void> => {
  const viewer = req.factionUser!;
  if (!requireManager(req, res)) return;
  const params = pointMemberParams.safeParse(req.params);
  const body = pointDeductionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Укажите сотрудника, положительное целое число баллов и причину списания." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: membersTable.id, nickname: membersTable.nickname, role: membersTable.role, status: membersTable.status })
      .from(membersTable)
      .where(eq(membersTable.id, params.data.memberId))
      .for("update");
    if (!target || target.role !== "employee" || target.status === "removed") {
      return { kind: "not_found" as const };
    }

    const delta = pointsDeductionDelta(body.data.amount);
    await recordPointChange(tx, {
      memberId: target.id,
      memberNickname: target.nickname,
      delta,
      reason: body.data.reason,
      source: "manual",
      actorId: viewer.id,
      actorNickname: viewer.nickname,
    });
    const [updated] = await tx
      .select({ points: membersTable.points })
      .from(membersTable)
      .where(eq(membersTable.id, target.id))
      .limit(1);
    if (!updated) throw new Error("Не удалось прочитать баланс баллов сотрудника.");
    return { kind: "ok" as const, memberId: target.id, points: updated.points };
  });

  if (result.kind === "not_found") {
    res.status(404).json({ error: "Сотрудник не найден." });
    return;
  }
  res.json({ memberId: result.memberId, points: result.points });
});

export default router;
