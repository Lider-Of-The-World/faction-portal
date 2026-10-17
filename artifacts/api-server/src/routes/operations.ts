import { desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateEventBody,
  CreateEventResponse,
  DeleteEventParams,
  DeleteEventResponse,
  DeleteStandardParams,
  DeleteStandardResponse,
  ListEventsResponse,
  ListStandardsResponse,
  UpdateEventBody,
  UpdateEventParams,
  UpdateEventResponse,
  UpdateStandardBody,
  UpdateStandardParams,
  UpdateStandardResponse,
  CreateStandardBody,
  CreateStandardResponse,
} from "@workspace/api-zod";
import { db, eventsTable, standardsTable } from "@workspace/db";
import { writeAudit } from "../lib/audit";
import { requireReadyAuth, requireManager } from "../lib/auth";

const router: IRouter = Router();

router.get("/events", requireReadyAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(eventsTable).orderBy(desc(eventsTable.startsAt));
  res.json(ListEventsResponse.parse(rows));
});

router.post("/events", requireReadyAuth, async (req, res): Promise<void> => {
  if (!requireManager(req, res)) return;
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Проверьте название, описание, дату и место." });
    return;
  }
  const [event] = await db.transaction(async (tx) => {
    const created = await tx
      .insert(eventsTable)
      .values({ ...parsed.data, createdById: req.factionUser!.id })
      .returning();
    const row = created[0]!;
    await writeAudit(tx, {
      actorId: req.factionUser!.id,
      actorNickname: req.factionUser!.nickname,
      category: "events",
      action: "event.created",
      entityType: "event",
      entityId: row.id,
      entityLabel: row.title,
      details: {
        description: row.description,
        startsAt: row.startsAt,
        location: row.location,
        status: row.status,
      },
    });
    return created;
  });
  res.status(201).json(CreateEventResponse.parse(event));
});

router.patch(
  "/events/:id",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = UpdateEventParams.safeParse(req.params);
    const body = UpdateEventBody.safeParse(req.body);
    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      res.status(400).json({ error: "Некорректные данные мероприятия." });
      return;
    }
    const event = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM faction_events WHERE id = ${params.data.id} FOR UPDATE`,
      );
      const [current] = await tx
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.id, params.data.id))
        .limit(1);
      if (!current) return undefined;
      const [updated] = await tx
        .update(eventsTable)
        .set(body.data)
        .where(eq(eventsTable.id, params.data.id))
        .returning();
      if (!updated) return undefined;
      await writeAudit(tx, {
        actorId: req.factionUser!.id,
        actorNickname: req.factionUser!.nickname,
        category: "events",
        action: "event.updated",
        entityType: "event",
        entityId: updated.id,
        entityLabel: updated.title,
        details: {
          before: {
            title: current.title,
            description: current.description,
            startsAt: current.startsAt,
            location: current.location,
            status: current.status,
          },
          after: {
            title: updated.title,
            description: updated.description,
            startsAt: updated.startsAt,
            location: updated.location,
            status: updated.status,
          },
        },
      });
      return updated;
    });
    if (!event) {
      res.status(404).json({ error: "Мероприятие не найдено." });
      return;
    }
    res.json(UpdateEventResponse.parse(event));
  },
);

router.delete(
  "/events/:id",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = DeleteEventParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Некорректный идентификатор мероприятия." });
      return;
    }
    const deleted = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: eventsTable.id, title: eventsTable.title })
        .from(eventsTable)
        .where(eq(eventsTable.id, params.data.id))
        .limit(1);
      if (!current) return undefined;
      const [removed] = await tx
        .delete(eventsTable)
        .where(eq(eventsTable.id, current.id))
        .returning({ id: eventsTable.id });
      if (!removed) return undefined;
      await writeAudit(tx, {
        actorId: req.factionUser!.id,
        actorNickname: req.factionUser!.nickname,
        category: "events",
        action: "event.deleted",
        entityType: "event",
        entityId: current.id,
        entityLabel: current.title,
      });
      return current;
    });
    if (!deleted) {
      res.status(404).json({ error: "Мероприятие не найдено." });
      return;
    }
    res.json(DeleteEventResponse.parse({ ok: true }));
  },
);

router.get("/standards", requireReadyAuth, async (req, res): Promise<void> => {
  if (!requireManager(req, res)) return;
  const rows = await db.select().from(standardsTable).orderBy(desc(standardsTable.createdAt));
  res.json(ListStandardsResponse.parse(rows));
});

router.post("/standards", requireReadyAuth, async (req, res): Promise<void> => {
  if (!requireManager(req, res)) return;
  const parsed = CreateStandardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Проверьте поля норматива." });
    return;
  }
  const [standard] = await db.transaction(async (tx) => {
    const created = await tx
      .insert(standardsTable)
      .values({ ...parsed.data, createdById: req.factionUser!.id })
      .returning();
    const row = created[0]!;
    await writeAudit(tx, {
      actorId: req.factionUser!.id,
      actorNickname: req.factionUser!.nickname,
      category: "standards",
      action: "standard.created",
      entityType: "standard",
      entityId: row.id,
      entityLabel: row.title,
      details: {
        description: row.description,
        requirements: row.requirements,
        category: row.category,
        target: row.target,
        unit: row.unit,
      },
    });
    return created;
  });
  res.status(201).json(CreateStandardResponse.parse(standard));
});

router.patch(
  "/standards/:id",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = UpdateStandardParams.safeParse(req.params);
    const body = UpdateStandardBody.safeParse(req.body);
    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      res.status(400).json({ error: "Некорректные данные норматива." });
      return;
    }
    const standard = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM faction_standards WHERE id = ${params.data.id} FOR UPDATE`,
      );
      const [current] = await tx
        .select()
        .from(standardsTable)
        .where(eq(standardsTable.id, params.data.id))
        .limit(1);
      if (!current) return undefined;
      const [updated] = await tx
        .update(standardsTable)
        .set(body.data)
        .where(eq(standardsTable.id, params.data.id))
        .returning();
      if (!updated) return undefined;
      await writeAudit(tx, {
        actorId: req.factionUser!.id,
        actorNickname: req.factionUser!.nickname,
        category: "standards",
        action: "standard.updated",
        entityType: "standard",
        entityId: updated.id,
        entityLabel: updated.title,
        details: {
          before: {
            title: current.title,
            description: current.description,
            requirements: current.requirements,
            category: current.category,
            target: current.target,
            unit: current.unit,
          },
          after: {
            title: updated.title,
            description: updated.description,
            requirements: updated.requirements,
            category: updated.category,
            target: updated.target,
            unit: updated.unit,
          },
        },
      });
      return updated;
    });
    if (!standard) {
      res.status(404).json({ error: "Норматив не найден." });
      return;
    }
    res.json(UpdateStandardResponse.parse(standard));
  },
);

router.delete(
  "/standards/:id",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = DeleteStandardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Некорректный идентификатор норматива." });
      return;
    }
    const deleted = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: standardsTable.id, title: standardsTable.title })
        .from(standardsTable)
        .where(eq(standardsTable.id, params.data.id))
        .limit(1);
      if (!current) return undefined;
      const [removed] = await tx
        .delete(standardsTable)
        .where(eq(standardsTable.id, current.id))
        .returning({ id: standardsTable.id });
      if (!removed) return undefined;
      await writeAudit(tx, {
        actorId: req.factionUser!.id,
        actorNickname: req.factionUser!.nickname,
        category: "standards",
        action: "standard.deleted",
        entityType: "standard",
        entityId: current.id,
        entityLabel: current.title,
      });
      return removed;
    });
    if (!deleted) {
      res.status(404).json({ error: "Норматив не найден." });
      return;
    }
    res.json(DeleteStandardResponse.parse({ ok: true }));
  },
);

export default router;
