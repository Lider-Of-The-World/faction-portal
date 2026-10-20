import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  inactivityRequestsTable,
  membersTable,
  standardAssignmentsTable,
  standardsTable,
} from "@workspace/db";
import { requireManager, requireReadyAuth } from "../lib/auth";
import { writeAudit } from "../lib/audit";
import { restoreDailyStandardsAfterInactivityCancellation } from "../lib/daily-standards";
import { getInactivityDailyCycleDueAtRange } from "../lib/inactivity-period";
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
          memberId: inactivityRequestsTable.memberId,
          startDate: inactivityRequestsTable.startDate,
          endDate: inactivityRequestsTable.endDate,
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
        .limit(1)
        .for("update");
      const cancellingApproval = body.data.status === "cancelled";
      if (
        !current ||
        (cancellingApproval
          ? current.status !== "approved"
          : current.status !== "pending_review")
      ) {
        return null;
      }

      const reviewedAt = new Date();
      const [updated] = await tx
        .update(inactivityRequestsTable)
        .set({
          status: body.data.status,
          reviewedAt,
          reviewerId: req.factionUser!.id,
          reviewerNickname: req.factionUser!.nickname,
        })
        .where(
          and(
            eq(inactivityRequestsTable.id, params.data.id),
            eq(
              inactivityRequestsTable.status,
              cancellingApproval ? "approved" : "pending_review",
            ),
          ),
        )
        .returning();
      if (!updated) return null;

      if (body.data.status === "approved") {
        const { firstDueAt, lastDueAt } = getInactivityDailyCycleDueAtRange(
          current,
        );
        const assignments = await tx
          .select({
            id: standardAssignmentsTable.id,
            dueAt: standardAssignmentsTable.dueAt,
            title: standardsTable.title,
          })
          .from(standardAssignmentsTable)
          .innerJoin(
            standardsTable,
            eq(standardAssignmentsTable.standardId, standardsTable.id),
          )
          .where(
            and(
              eq(standardAssignmentsTable.assigneeId, current.memberId),
              eq(standardAssignmentsTable.autoGenerated, true),
              inArray(standardAssignmentsTable.status, [
                "not_submitted",
                "pending_review",
                "revision_required",
              ]),
              gte(standardAssignmentsTable.dueAt, firstDueAt),
              lte(standardAssignmentsTable.dueAt, lastDueAt),
            ),
          )
          .for("update");

        for (const assignment of assignments) {
          const [cancelled] = await tx
            .update(standardAssignmentsTable)
            .set({ status: "cancelled" })
            .where(
              and(
                eq(standardAssignmentsTable.id, assignment.id),
                inArray(standardAssignmentsTable.status, [
                  "not_submitted",
                  "pending_review",
                  "revision_required",
                ]),
              ),
            )
            .returning({ id: standardAssignmentsTable.id });
          if (!cancelled) continue;

          await writeAudit(tx, {
            actorId: req.factionUser!.id,
            actorNickname: req.factionUser!.nickname,
            category: "standards",
            action: "standard.daily_cancelled_inactivity",
            entityType: "standard_assignment",
            entityId: assignment.id,
            entityLabel:
              "Снят дневной норматив из-за одобренного неактива: " +
              assignment.title + " → " + current.memberNickname,
            targetMemberId: current.memberId,
            targetMemberNickname: current.memberNickname,
            details: {
              automatic: true,
              inactivityRequestId: updated.id,
              startDate: updated.startDate,
              endDate: updated.endDate,
              dueAt: assignment.dueAt,
            },
          });
        }
      }

      if (body.data.status === "cancelled") {
        const restoredStandardCount =
          await restoreDailyStandardsAfterInactivityCancellation(
            tx,
            current.memberId,
            updated.id,
            reviewedAt,
          );
        await writeAudit(tx, {
          actorId: req.factionUser!.id,
          actorNickname: req.factionUser!.nickname,
          category: "standards",
          action: "inactivity.cancelled",
          entityType: "inactivity_request",
          entityId: updated.id,
          entityLabel:
            "Аннулирован неактив сотрудника: " + current.memberNickname,
          targetMemberId: current.memberId,
          targetMemberNickname: current.memberNickname,
          details: {
            startDate: updated.startDate,
            endDate: updated.endDate,
            restoredStandardCount,
          },
        });
      }

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
