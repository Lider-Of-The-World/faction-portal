import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListEventSubmissionsParams,
  ListEventSubmissionsResponse,
  ReviewEventSubmissionBody,
  ReviewEventSubmissionParams,
  ReviewEventSubmissionResponse,
  SubmitEventSubmissionBody,
  SubmitEventSubmissionParams,
  SubmitEventSubmissionResponse,
} from "@workspace/api-zod";
import {
  db,
  eventSubmissionFilesTable,
  eventSubmissionsTable,
  eventsTable,
  membersTable,
  uploadsTable,
} from "@workspace/db";
import { requireManager, requireReadyAuth } from "../lib/auth";
import { writeAudit } from "../lib/audit";
import { ObjectStorageService } from "../lib/objectStorage";
import { verifyStoredImage } from "../lib/uploadValidation";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

async function getSubmissionHistory(eventId: string, memberId?: string) {
  const rows = await db
    .select({
      submission: eventSubmissionsTable,
      memberNickname: membersTable.nickname,
    })
    .from(eventSubmissionsTable)
    .innerJoin(
      membersTable,
      eq(eventSubmissionsTable.memberId, membersTable.id),
    )
    .where(
      and(
        eq(eventSubmissionsTable.eventId, eventId),
        memberId ? eq(eventSubmissionsTable.memberId, memberId) : undefined,
      ),
    )
    .orderBy(desc(eventSubmissionsTable.submittedAt));

  if (rows.length === 0) return [];
  const submissionIds = rows.map(({ submission }) => submission.id);
  const files = await db
    .select({
      submissionId: eventSubmissionFilesTable.submissionId,
      id: uploadsTable.id,
      objectPath: uploadsTable.objectPath,
      originalName: uploadsTable.originalName,
      contentType: uploadsTable.contentType,
      actualSize: uploadsTable.actualSize,
      size: uploadsTable.size,
      verificationStatus: uploadsTable.verificationStatus,
    })
    .from(eventSubmissionFilesTable)
    .innerJoin(
      uploadsTable,
      eq(eventSubmissionFilesTable.uploadId, uploadsTable.id),
    )
    .where(inArray(eventSubmissionFilesTable.submissionId, submissionIds));

  const filesBySubmission = new Map<string, typeof files>();
  for (const file of files) {
    const attached = filesBySubmission.get(file.submissionId) ?? [];
    attached.push(file);
    filesBySubmission.set(file.submissionId, attached);
  }

  return rows.map(({ submission, memberNickname }) => ({
    ...submission,
    memberNickname,
    files: (filesBySubmission.get(submission.id) ?? []).map((file) => ({
      id: file.id,
      objectPath: file.objectPath,
      originalName: file.originalName,
      contentType: file.contentType,
      size: file.actualSize ?? file.size,
      verificationStatus: file.verificationStatus,
    })),
  }));
}

async function verifyUploads(
  uploadIds: string[],
  memberId: string,
  req: Parameters<Parameters<IRouter["post"]>[1]>[0],
  res: Parameters<Parameters<IRouter["post"]>[1]>[1],
): Promise<boolean> {
  if (new Set(uploadIds).size !== uploadIds.length) {
    res.status(400).json({ error: "Один и тот же файл нельзя прикрепить несколько раз." });
    return false;
  }
  const uploads = await db
    .select()
    .from(uploadsTable)
    .where(inArray(uploadsTable.id, uploadIds));
  if (
    uploads.length !== uploadIds.length ||
    uploads.some((upload) => upload.memberId !== memberId)
  ) {
    res.status(400).json({ error: "Один или несколько файлов недоступны." });
    return false;
  }

  for (const upload of uploads) {
    try {
      const file = await objectStorage.getObjectEntityFile(upload.objectPath);
      const verification = await verifyStoredImage(upload, file);
      if ("error" in verification) {
        await db
          .update(uploadsTable)
          .set({
            verificationStatus: "rejected",
            verificationMessage: verification.error,
            verifiedAt: new Date(),
          })
          .where(eq(uploadsTable.id, upload.id));
        res.status(422).json({ error: verification.error });
        return false;
      }
      await db
        .update(uploadsTable)
        .set({
          actualSize: verification.verified.actualSize,
          detectedContentType: verification.verified.detectedContentType,
          verificationStatus: "verified",
          verificationMessage: null,
          verifiedAt: new Date(),
        })
        .where(eq(uploadsTable.id, upload.id));
    } catch (error) {
      req.log.warn(
        { err: error, uploadId: upload.id },
        "Event report screenshot verification failed",
      );
      await db
        .update(uploadsTable)
        .set({
          verificationStatus: "rejected",
          verificationMessage: "Файл не найден или не прошёл проверку.",
          verifiedAt: new Date(),
        })
        .where(eq(uploadsTable.id, upload.id));
      res.status(422).json({ error: "Файл не найден или не прошёл проверку." });
      return false;
    }
  }
  return true;
}

router.get(
  "/events/:id/submissions",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const params = ListEventSubmissionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Некорректное мероприятие." });
      return;
    }
    const [event] = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.id))
      .limit(1);
    if (!event) {
      res.status(404).json({ error: "Мероприятие не найдено." });
      return;
    }
    const memberId =
      req.factionUser!.role === "employee" ? req.factionUser!.id : undefined;
    res.json(
      ListEventSubmissionsResponse.parse(
        await getSubmissionHistory(event.id, memberId),
      ),
    );
  },
);

router.post(
  "/events/:id/submissions",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const params = SubmitEventSubmissionParams.safeParse(req.params);
    const body = SubmitEventSubmissionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Добавьте хотя бы один допустимый скриншот." });
      return;
    }
    const viewer = req.factionUser!;
    if (viewer.role !== "employee") {
      res.status(403).json({ error: "Отправить отчёт может только сотрудник." });
      return;
    }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.id))
      .limit(1);
    const now = new Date();
    if (!event) {
      res.status(404).json({ error: "Мероприятие не найдено." });
      return;
    }
    if (
      event.status !== "planned" ||
      event.startsAt > now ||
      !event.endsAt ||
      event.endsAt <= now
    ) {
      res.status(409).json({
        error: "Отчёт можно отправить только во время мероприятия.",
      });
      return;
    }
    if (!(await verifyUploads(body.data.uploadIds, viewer.id, req, res))) return;

    const submission = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM faction_events WHERE id = ${event.id} FOR UPDATE`,
      );
      const [lockedEvent] = await tx
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.id, event.id))
        .limit(1);
      const transactionNow = new Date();
      if (
        !lockedEvent ||
        lockedEvent.status !== "planned" ||
        lockedEvent.startsAt > transactionNow ||
        !lockedEvent.endsAt ||
        lockedEvent.endsAt <= transactionNow
      ) {
        return null;
      }

      const [latest] = await tx
        .select({ status: eventSubmissionsTable.status })
        .from(eventSubmissionsTable)
        .where(
          and(
            eq(eventSubmissionsTable.eventId, event.id),
            eq(eventSubmissionsTable.memberId, viewer.id),
          ),
        )
        .orderBy(desc(eventSubmissionsTable.version))
        .limit(1);
      if (latest) {
        return null;
      }

      const [versionCount] = await tx
        .select({ value: count() })
        .from(eventSubmissionsTable)
        .where(
          and(
            eq(eventSubmissionsTable.eventId, event.id),
            eq(eventSubmissionsTable.memberId, viewer.id),
          ),
        );
      const [created] = await tx
        .insert(eventSubmissionsTable)
        .values({
          eventId: event.id,
          memberId: viewer.id,
          version: Number(versionCount?.value ?? 0) + 1,
          comment: body.data.comment.trim(),
          status: "pending_review",
        })
        .returning();
      await tx.insert(eventSubmissionFilesTable).values(
        body.data.uploadIds.map((uploadId) => ({
          submissionId: created!.id,
          uploadId,
        })),
      );
      await writeAudit(tx, {
        actorId: viewer.id,
        actorNickname: viewer.nickname,
        category: "events",
        action: "event.report_submitted",
        entityType: "event_submission",
        entityId: created!.id,
        entityLabel: `Отчёт по мероприятию: ${event.title}`,
        targetMemberId: viewer.id,
        targetMemberNickname: viewer.nickname,
        details: { eventId: event.id, version: created!.version },
      });
      return created!;
    });
    if (!submission) {
      res.status(409).json({
        error: "Отчёт уже отправлен или сейчас нельзя отправить новый.",
      });
      return;
    }

    res.status(201).json(
      SubmitEventSubmissionResponse.parse({
        ...submission,
        memberNickname: viewer.nickname,
        files: await getSubmissionHistory(event.id, viewer.id).then((history) =>
          history.find((item) => item.id === submission.id)?.files ?? [],
        ),
      }),
    );
  },
);

router.patch(
  "/event-submissions/:id/review",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = ReviewEventSubmissionParams.safeParse(req.params);
    const body = ReviewEventSubmissionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Проверьте решение по отчёту." });
      return;
    }
    const reason = body.data.reason?.trim() ?? "";
    if (body.data.status !== "approved" && !reason) {
      res.status(400).json({
        error: "Для отклонения укажите причину.",
      });
      return;
    }

    const reviewed = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          submission: eventSubmissionsTable,
          eventTitle: eventsTable.title,
          memberNickname: membersTable.nickname,
        })
        .from(eventSubmissionsTable)
        .innerJoin(eventsTable, eq(eventSubmissionsTable.eventId, eventsTable.id))
        .innerJoin(
          membersTable,
          eq(eventSubmissionsTable.memberId, membersTable.id),
        )
        .where(eq(eventSubmissionsTable.id, params.data.id))
        .limit(1);
      if (!current || current.submission.status !== "pending_review") return null;

      const [updated] = await tx
        .update(eventSubmissionsTable)
        .set({
          status: body.data.status,
          decisionReason: reason || null,
          reviewedAt: new Date(),
          reviewerId: req.factionUser!.id,
          reviewerNickname: req.factionUser!.nickname,
        })
        .where(
          and(
            eq(eventSubmissionsTable.id, current.submission.id),
            eq(eventSubmissionsTable.status, "pending_review"),
          ),
        )
        .returning();
      if (!updated) return null;
      await writeAudit(tx, {
        actorId: req.factionUser!.id,
        actorNickname: req.factionUser!.nickname,
        category: "events",
        action: "event.report_reviewed",
        entityType: "event_submission",
        entityId: updated.id,
        entityLabel: `Проверен отчёт: ${current.eventTitle}`,
        targetMemberId: updated.memberId,
        targetMemberNickname: current.memberNickname,
        reason: reason || null,
        details: { eventId: updated.eventId, status: updated.status },
      });
      return updated;
    });
    if (!reviewed) {
      res.status(409).json({ error: "Этот отчёт уже проверен или удалён." });
      return;
    }

    const history = await getSubmissionHistory(reviewed.eventId);
    const result = history.find((item) => item.id === reviewed.id);
    if (!result) {
      res.status(404).json({ error: "Отчёт не найден." });
      return;
    }
    res.json(ReviewEventSubmissionResponse.parse(result));
  },
);

export default router;
