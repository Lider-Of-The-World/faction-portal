import { and, desc, eq, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { db, notificationsTable } from "@workspace/db";
import { requireReadyAuth } from "../lib/auth";

const router: IRouter = Router();

router.get(
  "/notifications",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.recipientId, req.factionUser!.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(100);
    res.json(ListNotificationsResponse.parse(rows));
  },
);

router.patch(
  "/notifications/:id/read",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const params = MarkNotificationReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Некорректное уведомление." });
      return;
    }
    const [notification] = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, params.data.id),
          eq(notificationsTable.recipientId, req.factionUser!.id),
        ),
      )
      .returning();
    if (!notification) {
      res.status(404).json({ error: "Уведомление не найдено." });
      return;
    }
    res.json(MarkNotificationReadResponse.parse(notification));
  },
);

router.post(
  "/notifications/read-all",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.recipientId, req.factionUser!.id),
          isNull(notificationsTable.readAt),
        ),
      );
    res.json(MarkAllNotificationsReadResponse.parse({ ok: true }));
  },
);

export default router;
