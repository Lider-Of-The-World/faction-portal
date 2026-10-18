import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  inactivityRequestsTable,
  membersTable,
} from "@workspace/db";
import { requireManager, requireReadyAuth } from "../lib/auth";
import {
  createInactivityRequestSchema,
  inactivityRequestParamsSchema,
  reviewInactivityRequestSchema,
} from "../lib/inactivity-validation";

const router: IRouter = Router();

router.get(
  "/inactivity-requests",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const viewer = req.factionUser!;
    const rows = await db
      .select({
        request: inactivityRequestsTable,
        memberNickname: membersTable.nickname,
        memberRank: membersTable.rank,
      })
      .from(inactivityRequestsTable)
      .innerJoin(
        membersTable,
        eq(inactivityRequestsTable.memberId, membersTable.id),
      )
      .where(
        viewer.role === "employee"
          ? eq(inactivityRequestsTable.memberId, viewer.id)
          : undefined,
      )
      .orderBy(desc(inactivityRequestsTable.submittedAt));

    res.json(
      rows.map(({ request, memberNickname, memberRank }) => ({
        ...request,
        memberNickname,
        memberRank,
      })),
    );
  },
);

router.post(
  "/inactivity-requests",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const viewer = req.factionUser!;
    if (viewer.role !== "employee") {
      res.status(403).json({ error: "Подать заявку может только сотрудник." });
      return;
    }
    const body = createInactivityRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: "Укажите корректный период и причину неактива (не менее 3 символов).",
      });
      return;
    }

    const [created] = await db
      .insert(inactivityRequestsTable)
      .values({
        memberId: viewer.id,
        startDate: body.data.startDate,
        endDate: body.data.endDate,
        reason: body.data.reason,
      })
      .returning();
    if (!created) {
      res.status(500).json({ error: "Не удалось создать заявку." });
      return;
    }

    res.status(201).json({
      ...created,
      memberNickname: viewer.nickname,
      memberRank: viewer.rank,
    });
  },
);

router.patch(
  "/inactivity-requests/:id/review",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = inactivityRequestParamsSchema.safeParse(req.params);
    const body = reviewInactivityRequestSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Проверьте заявку и решение." });
      return;
    }

    const reviewed = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: inactivityRequestsTable.status,
          memberNickname: membersTable.nickname,
          memberRank: membersTable.rank,
        })
        .from(inactivityRequestsTable)
        .innerJoin(
          membersTable,
          eq(inactivityRequestsTable.memberId, membersTable.id),
        )
        .where(eq(inactivityRequestsTable.id, params.data.id))
        .limit(1);
      if (!current || current.status !== "pending_review") return null;

      const [updated] = await tx
        .update(inactivityRequestsTable)
        .set({
          status: body.data.status,
          reviewedAt: new Date(),
          reviewerId: req.factionUser!.id,
          reviewerNickname: req.factionUser!.nickname,
        })
        .where(
          and(
            eq(inactivityRequestsTable.id, params.data.id),
            eq(inactivityRequestsTable.status, "pending_review"),
          ),
        )
        .returning();
      if (!updated) return null;
      return {
        ...updated,
        memberNickname: current.memberNickname,
        memberRank: current.memberRank,
      };
    });

    if (!reviewed) {
      res.status(409).json({ error: "Заявка уже проверена или не найдена." });
      return;
    }
    res.json(reviewed);
  },
);

export default router;
