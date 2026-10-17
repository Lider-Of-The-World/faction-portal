import { lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { authSessionsTable, db, systemJobStateTable } from "@workspace/db";
import { allowCronRequestFromIp, constantTimeSecretMatch } from "../lib/cron-security";

const router: IRouter = Router();
const JOB_NAME = "external-maintenance";
const DATABASE_RATE_LIMIT_MS = 60_000;

router.get("/cron/maintenance", async (req, res): Promise<void> => {
  if (!allowCronRequestFromIp(req.ip || "unknown")) {
    res.status(429).json({ error: "Слишком много запросов." });
    return;
  }

  const expectedSecret = process.env.CRON_SECRET;
  const suppliedSecret = req.get("x-cron-secret");
  if (
    !expectedSecret ||
    !constantTimeSecretMatch(expectedSecret, suppliedSecret)
  ) {
    res.status(404).json({ error: "Маршрут не найден." });
    return;
  }

  try {
    const now = new Date();
    const allowedBefore = new Date(now.getTime() - DATABASE_RATE_LIMIT_MS);
    const [claim] = await db
      .insert(systemJobStateTable)
      .values({ jobName: JOB_NAME, lastRunAt: now })
      .onConflictDoUpdate({
        target: systemJobStateTable.jobName,
        set: { lastRunAt: now },
        setWhere: lt(systemJobStateTable.lastRunAt, allowedBefore),
      })
      .returning({ jobName: systemJobStateTable.jobName });

    if (!claim) {
      res.status(429).json({ error: "Запрос уже выполнялся недавно." });
      return;
    }

    await db
      .delete(authSessionsTable)
      .where(lt(authSessionsTable.expiresAt, now));
    res.status(200).json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "Scheduled maintenance request failed");
    res.status(503).json({ error: "Служба временно недоступна." });
  }
});

export default router;
