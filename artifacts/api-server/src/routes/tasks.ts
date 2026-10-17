import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CancelTaskBody,
  CancelTaskParams,
  CancelTaskResponse,
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  DeleteTaskResponse,
  ListTaskSubmissionsParams,
  ListTaskSubmissionsResponse,
  ListTaskSubmissionsResponseItem,
  ListTasksResponse,
  ReviewTaskSubmissionBody,
  ReviewTaskSubmissionParams,
  ReviewTaskSubmissionResponse,
  SubmitTaskBody,
  SubmitTaskParams,
  SubmitTaskResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import {
  db,
  membersTable,
  notificationsTable,
  taskSubmissionFilesTable,
  taskSubmissionsTable,
  tasksTable,
  uploadsTable,
} from "@workspace/db";
import { requireManager, requireReadyAuth } from "../lib/auth";
import { writeAudit } from "../lib/audit";
import { ObjectStorageService } from "../lib/objectStorage";
import { verifyStoredImage } from "../lib/uploadValidation";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

function asDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function selectTasks(memberId?: string) {
  const rows = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      reason: tasksTable.reason,
      assigneeId: tasksTable.assigneeId,
      assigneeNickname: membersTable.nickname,
      status: tasksTable.status,
      priority: tasksTable.priority,
      issuedAt: tasksTable.issuedAt,
      dueAt: tasksTable.dueAt,
      evidencePath: tasksTable.evidencePath,
      createdAt: tasksTable.createdAt,
    })
    .from(tasksTable)
    .leftJoin(membersTable, eq(tasksTable.assigneeId, membersTable.id))
    .where(memberId ? eq(tasksTable.assigneeId, memberId) : undefined)
    .orderBy(desc(tasksTable.createdAt));

  if (rows.length === 0) return [];
  const taskIds = rows.map((task) => task.id);
  const submissions = await db
    .select()
    .from(taskSubmissionsTable)
    .where(inArray(taskSubmissionsTable.taskId, taskIds))
    .orderBy(desc(taskSubmissionsTable.version));
  const byTask = new Map<string, (typeof submissions)[number][]>();
  for (const submission of submissions) {
    const versions = byTask.get(submission.taskId) ?? [];
    versions.push(submission);
    byTask.set(submission.taskId, versions);
  }

  const now = Date.now();
  return rows.map((task) => {
    const versions = byTask.get(task.id) ?? [];
    const latest = versions[0];
    const status =
      ["assigned", "in_progress"].includes(task.status) &&
      task.dueAt !== null &&
      task.dueAt.getTime() < now
        ? "overdue"
        : task.status;
    return {
      ...task,
      status,
      versionCount: versions.length,
      latestVersion: latest?.version ?? null,
      latestComment: latest?.comment ?? null,
      latestReviewReason: latest?.decisionReason ?? null,
    };
  });
}

async function getSubmissionHistory(taskId: string) {
  const submissions = await db
    .select()
    .from(taskSubmissionsTable)
    .where(eq(taskSubmissionsTable.taskId, taskId))
    .orderBy(taskSubmissionsTable.version);
  if (submissions.length === 0) return [];

  const files = await db
    .select({
      submissionId: taskSubmissionFilesTable.submissionId,
      id: uploadsTable.id,
      objectPath: uploadsTable.objectPath,
      originalName: uploadsTable.originalName,
      contentType: uploadsTable.contentType,
      actualSize: uploadsTable.actualSize,
      size: uploadsTable.size,
      verificationStatus: uploadsTable.verificationStatus,
    })
    .from(taskSubmissionFilesTable)
    .innerJoin(
      uploadsTable,
      eq(taskSubmissionFilesTable.uploadId, uploadsTable.id),
    )
    .where(
      inArray(
        taskSubmissionFilesTable.submissionId,
        submissions.map((submission) => submission.id),
      ),
    );
  const filesBySubmission = new Map<string, typeof files>();
  for (const file of files) {
    const current = filesBySubmission.get(file.submissionId) ?? [];
    current.push(file);
    filesBySubmission.set(file.submissionId, current);
  }

  return submissions.map((submission) =>
    ListTaskSubmissionsResponseItem.parse({
      ...submission,
      files: (filesBySubmission.get(submission.id) ?? []).map((file) => ({
        id: file.id,
        objectPath: file.objectPath,
        originalName: file.originalName,
        contentType: file.contentType,
        size: file.actualSize ?? file.size,
        verificationStatus: file.verificationStatus,
      })),
    }),
  );
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
      req.log.warn({ err: error, uploadId: upload.id }, "Screenshot verification failed");
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

router.get("/tasks", requireReadyAuth, async (req, res): Promise<void> => {
  const tasks = await selectTasks(
    req.factionUser!.role === "employee" ? req.factionUser!.id : undefined,
  );
  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks", requireReadyAuth, async (req, res): Promise<void> => {
  if (!requireManager(req, res)) return;
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Проверьте название, причину, исполнителя и дедлайн." });
    return;
  }
  const dueAt = asDate(parsed.data.dueAt);
  if (!dueAt || dueAt.getTime() <= Date.now()) {
    res.status(400).json({ error: "Дедлайн должен быть позже даты выдачи задания." });
    return;
  }
  const [assignee] = await db
    .select({
      id: membersTable.id,
      nickname: membersTable.nickname,
      role: membersTable.role,
      status: membersTable.status,
    })
    .from(membersTable)
    .where(eq(membersTable.id, parsed.data.assigneeId))
    .limit(1);
  if (!assignee || assignee.role !== "employee" || assignee.status !== "active") {
    res.status(400).json({ error: "Выберите активного сотрудника." });
    return;
  }

  const [created] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(tasksTable)
      .values({
        title: parsed.data.title,
        description: parsed.data.description,
        reason: parsed.data.reason,
        assigneeId: assignee.id,
        priority: parsed.data.priority,
        dueAt,
        createdById: req.factionUser!.id,
        status: "assigned",
      })
      .returning();
    await tx.insert(notificationsTable).values({
      recipientId: assignee.id,
      kind: "task_assigned",
      title: "Назначено новое задание",
      message: `${parsed.data.title} — срок ${dueAt.toLocaleString("ru-RU")}.`,
      relatedType: "task",
      relatedId: inserted[0]!.id,
    });
    await writeAudit(tx, {
      actorId: req.factionUser!.id,
      actorNickname: req.factionUser!.nickname,
      category: "tasks",
      action: "task.created",
      entityType: "task",
      entityId: inserted[0]!.id,
      entityLabel: parsed.data.title,
      targetMemberId: assignee.id,
      targetMemberNickname: assignee.nickname,
      reason: parsed.data.reason,
      details: {
        description: parsed.data.description,
        priority: parsed.data.priority,
        dueAt,
      },
    });
    return inserted;
  });
  const result = (await selectTasks()).find((task) => task.id === created!.id);
  res.status(201).json(CreateTaskResponse.parse(result));
});

router.patch(
  "/tasks/:id",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const params = UpdateTaskParams.safeParse(req.params);
    const body = UpdateTaskBody.safeParse(req.body);
    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      res.status(400).json({ error: "Некорректные данные задания." });
      return;
    }
    const [current] = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, params.data.id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Задание не найдено." });
      return;
    }

    const viewer = req.factionUser!;
    if (viewer.role === "employee") {
      if (
        current.assigneeId !== viewer.id ||
        Object.keys(body.data).length !== 1 ||
        body.data.status !== "in_progress" ||
        !["assigned", "rejected", "revision_required"].includes(current.status)
      ) {
        res.status(403).json({ error: "Сотрудник может только отметить своё задание как выполняемое." });
        return;
      }
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(tasksTable)
          .set({ status: "in_progress" })
          .where(
            and(
              eq(tasksTable.id, current.id),
              eq(tasksTable.assigneeId, viewer.id),
              eq(tasksTable.status, current.status),
            ),
          )
          .returning();
        if (!updated) return;
        await writeAudit(tx, {
          actorId: viewer.id,
          actorNickname: viewer.nickname,
          category: "tasks",
          action: "task.started",
          entityType: "task",
          entityId: current.id,
          entityLabel: current.title,
          targetMemberId: viewer.id,
          targetMemberNickname: viewer.nickname,
          details: { from: current.status, to: updated.status },
        });
      });
    } else {
      if (!requireManager(req, res)) return;
      if ("status" in body.data || "evidencePath" in body.data) {
        res.status(400).json({ error: "Статус меняется отправкой, проверкой или отменой; файлы добавляются через отправку отчёта." });
        return;
      }
      const changes = { ...body.data };
      if (changes.dueAt !== undefined && changes.dueAt !== null) {
        const dueAt = asDate(changes.dueAt);
        if (!dueAt || dueAt.getTime() <= current.issuedAt.getTime()) {
          res.status(400).json({ error: "Дедлайн должен быть позже даты выдачи задания." });
          return;
        }
        changes.dueAt = dueAt;
      }
      let assigneeNickname: string | undefined;
      if (changes.assigneeId) {
        const [assignee] = await db
          .select({
            id: membersTable.id,
            nickname: membersTable.nickname,
            role: membersTable.role,
            status: membersTable.status,
          })
          .from(membersTable)
          .where(eq(membersTable.id, changes.assigneeId))
          .limit(1);
        if (!assignee || assignee.role !== "employee" || assignee.status !== "active") {
          res.status(400).json({ error: "Выберите активного сотрудника." });
          return;
        }
        assigneeNickname = assignee.nickname;
      }
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(tasksTable)
          .set(changes)
          .where(eq(tasksTable.id, current.id))
          .returning();
        if (!updated) return;
        if (
          changes.assigneeId &&
          changes.assigneeId !== current.assigneeId
        ) {
          await tx.insert(notificationsTable).values({
            recipientId: changes.assigneeId,
            kind: "task_assigned",
            title: "Вам передано задание",
            message: current.title,
            relatedType: "task",
            relatedId: current.id,
          });
        }
        await writeAudit(tx, {
          actorId: viewer.id,
          actorNickname: viewer.nickname,
          category: "tasks",
          action: "task.updated",
          entityType: "task",
          entityId: current.id,
          entityLabel: updated.title,
          targetMemberId: changes.assigneeId ?? current.assigneeId,
          targetMemberNickname: assigneeNickname,
          details: {
            changedFields: Object.keys(changes),
            before: {
              title: current.title,
              description: current.description,
              reason: current.reason,
              assigneeId: current.assigneeId,
              priority: current.priority,
              dueAt: current.dueAt,
            },
            after: {
              title: updated.title,
              description: updated.description,
              reason: updated.reason,
              assigneeId: updated.assigneeId,
              priority: updated.priority,
              dueAt: updated.dueAt,
            },
          },
        });
      });
    }
    const updated = (await selectTasks()).find((task) => task.id === current.id);
    res.json(UpdateTaskResponse.parse(updated));
  },
);

router.get(
  "/tasks/:id/submissions",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const params = ListTaskSubmissionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Некорректное задание." });
      return;
    }
    const [task] = await db
      .select({ id: tasksTable.id, assigneeId: tasksTable.assigneeId })
      .from(tasksTable)
      .where(eq(tasksTable.id, params.data.id))
      .limit(1);
    if (
      !task ||
      (req.factionUser!.role === "employee" &&
        task.assigneeId !== req.factionUser!.id)
    ) {
      res.status(404).json({ error: "Задание не найдено." });
      return;
    }
    res.json(ListTaskSubmissionsResponse.parse(await getSubmissionHistory(task.id)));
  },
);

router.post(
  "/tasks/:id/submissions",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const params = SubmitTaskParams.safeParse(req.params);
    const body = SubmitTaskBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Добавьте от 1 до 8 допустимых скриншотов." });
      return;
    }
    const viewer = req.factionUser!;
    if (viewer.role !== "employee") {
      res.status(403).json({ error: "Отправить отчёт по заданию может только сотрудник." });
      return;
    }
    const [task] = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, params.data.id))
      .limit(1);
    if (!task || task.assigneeId !== viewer.id) {
      res.status(404).json({ error: "Задание не найдено." });
      return;
    }
    if (!["assigned", "in_progress", "rejected", "revision_required"].includes(task.status)) {
      res.status(409).json({ error: "Сейчас нельзя отправить новую версию этого задания." });
      return;
    }
    if (!(await verifyUploads(body.data.uploadIds, viewer.id, req, res))) return;

    const [submission] = await db.transaction(async (tx) => {
      const [versionCount] = await tx
        .select({ value: count() })
        .from(taskSubmissionsTable)
        .where(eq(taskSubmissionsTable.taskId, task.id));
      const created = await tx
        .insert(taskSubmissionsTable)
        .values({
          taskId: task.id,
          version: Number(versionCount?.value ?? 0) + 1,
          comment: body.data.comment,
          status: "pending_review",
        })
        .returning();
      await tx.insert(taskSubmissionFilesTable).values(
        body.data.uploadIds.map((uploadId) => ({
          submissionId: created[0]!.id,
          uploadId,
        })),
      );
      await tx
        .update(tasksTable)
        .set({ status: "pending_review" })
        .where(eq(tasksTable.id, task.id));
      const managers = await tx
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(
          and(
            inArray(membersTable.role, ["leader", "admin"]),
            eq(membersTable.status, "active"),
          ),
        );
      if (managers.length > 0) {
        await tx.insert(notificationsTable).values(
          managers.map((manager) => ({
            recipientId: manager.id,
            kind: "task_submitted",
            title: "Задание ожидает проверки",
            message: `${viewer.nickname} отправил «${task.title}», версия ${created[0]!.version}.`,
            relatedType: "task",
            relatedId: task.id,
          })),
        );
      }
      await writeAudit(tx, {
        actorId: viewer.id,
        actorNickname: viewer.nickname,
        category: "tasks",
        action: "task.submitted",
        entityType: "task_submission",
        entityId: created[0]!.id,
        entityLabel: `Отправлен отчёт: ${task.title}`,
        targetMemberId: viewer.id,
        targetMemberNickname: viewer.nickname,
        details: { taskId: task.id, version: created[0]!.version },
      });
      return created;
    });
    const uploads = await db
      .select()
      .from(uploadsTable)
      .where(inArray(uploadsTable.id, body.data.uploadIds));
    res.status(201).json(
      SubmitTaskResponse.parse({
        ...submission,
        files: uploads.map((upload) => ({
          id: upload.id,
          objectPath: upload.objectPath,
          originalName: upload.originalName,
          contentType: upload.contentType,
          size: upload.actualSize ?? upload.size,
          verificationStatus: upload.verificationStatus,
        })),
      }),
    );
  },
);

router.patch(
  "/task-submissions/:id/review",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = ReviewTaskSubmissionParams.safeParse(req.params);
    const body = ReviewTaskSubmissionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Проверьте решение по заданию." });
      return;
    }
    const reason = body.data.reason?.trim() ?? "";
    if (body.data.status !== "approved" && !reason) {
      res.status(400).json({ error: "Для отклонения или возврата на доработку обязательно укажите причину." });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          submission: taskSubmissionsTable,
          task: tasksTable,
          assigneeNickname: membersTable.nickname,
        })
        .from(taskSubmissionsTable)
        .innerJoin(tasksTable, eq(taskSubmissionsTable.taskId, tasksTable.id))
        .leftJoin(membersTable, eq(tasksTable.assigneeId, membersTable.id))
        .where(eq(taskSubmissionsTable.id, params.data.id))
        .limit(1);
      if (!current || current.submission.status !== "pending_review") return null;
      const [reviewed] = await tx
        .update(taskSubmissionsTable)
        .set({
          status: body.data.status,
          decisionReason: reason || null,
          reviewedAt: new Date(),
          reviewerId: req.factionUser!.id,
          reviewerNickname: req.factionUser!.nickname,
        })
        .where(
          and(
            eq(taskSubmissionsTable.id, current.submission.id),
            eq(taskSubmissionsTable.status, "pending_review"),
          ),
        )
        .returning();
      if (!reviewed) return null;
      await tx
        .update(tasksTable)
        .set({ status: body.data.status })
        .where(eq(tasksTable.id, current.task.id));
      if (current.task.assigneeId) {
        const outcome =
          body.data.status === "approved"
            ? "Задание одобрено"
            : body.data.status === "rejected"
              ? "Задание отклонено"
              : "Задание возвращено на доработку";
        await tx.insert(notificationsTable).values({
          recipientId: current.task.assigneeId,
          kind: "task_reviewed",
          title: "Есть результат проверки задания",
          message: reason ? `${outcome}: ${reason}` : outcome,
          relatedType: "task",
          relatedId: current.task.id,
        });
      }
      await writeAudit(tx, {
        actorId: req.factionUser!.id,
        actorNickname: req.factionUser!.nickname,
        category: "tasks",
        action: "task.reviewed",
        entityType: "task_submission",
        entityId: reviewed.id,
        entityLabel: `Проверен отчёт: ${current.task.title}`,
        targetMemberId: current.task.assigneeId,
        targetMemberNickname: current.assigneeNickname,
        reason: reason || null,
        details: {
          taskId: current.task.id,
          status: body.data.status,
          version: reviewed.version,
        },
      });
      return reviewed;
    });
    if (!updated) {
      res.status(404).json({ error: "Отправленная версия не найдена или уже проверена." });
      return;
    }
    res.json(
      ReviewTaskSubmissionResponse.parse({
        ...updated,
        files: await getSubmissionHistory(updated.taskId).then(
          (history) => history.find((item) => item.id === updated.id)?.files ?? [],
        ),
      }),
    );
  },
);

router.post(
  "/tasks/:id/cancel",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = CancelTaskParams.safeParse(req.params);
    const body = CancelTaskBody.safeParse(req.body);
    if (!params.success || !body.success || !body.data.reason.trim()) {
      res.status(400).json({ error: "Для отмены задания обязательно укажите причину." });
      return;
    }
    const task = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, params.data.id))
        .limit(1);
      if (!current || ["cancelled", "approved"].includes(current.status)) return null;
      const [assignee] = current.assigneeId
        ? await tx
            .select({ nickname: membersTable.nickname })
            .from(membersTable)
            .where(eq(membersTable.id, current.assigneeId))
            .limit(1)
        : [];
      const [cancelled] = await tx
        .update(tasksTable)
        .set({
          status: "cancelled",
          cancellationReason: body.data.reason.trim(),
          cancelledAt: new Date(),
          cancelledById: req.factionUser!.id,
        })
        .where(
          and(
            eq(tasksTable.id, current.id),
            eq(tasksTable.status, current.status),
          ),
        )
        .returning();
      if (!cancelled) return null;
      if (current.assigneeId) {
        await tx.insert(notificationsTable).values({
          recipientId: current.assigneeId,
          kind: "task_cancelled",
          title: "Задание отменено",
          message: `${current.title}: ${body.data.reason.trim()}`,
          relatedType: "task",
          relatedId: current.id,
        });
      }
      await writeAudit(tx, {
        actorId: req.factionUser!.id,
        actorNickname: req.factionUser!.nickname,
        category: "tasks",
        action: "task.cancelled",
        entityType: "task",
        entityId: current.id,
        entityLabel: current.title,
        targetMemberId: current.assigneeId,
        targetMemberNickname: assignee?.nickname,
        reason: body.data.reason.trim(),
      });
      return cancelled;
    });
    if (!task) {
      res.status(404).json({ error: "Задание не найдено или его уже нельзя отменить." });
      return;
    }
    const result = (await selectTasks()).find((item) => item.id === task.id);
    res.json(CancelTaskResponse.parse(result));
  },
);

router.delete(
  "/tasks/:id",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = DeleteTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Некорректный идентификатор задания." });
      return;
    }
    const deleted = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM faction_tasks WHERE id = ${params.data.id} FOR UPDATE`,
      );
      const [task] = await tx
        .select({ id: tasksTable.id, title: tasksTable.title })
        .from(tasksTable)
        .where(eq(tasksTable.id, params.data.id))
        .limit(1);
      if (!task) return { kind: "not-found" as const };
      const [submissionCount] = await tx
        .select({ value: count() })
        .from(taskSubmissionsTable)
        .where(eq(taskSubmissionsTable.taskId, task.id));
      if (Number(submissionCount?.value ?? 0) > 0) {
        return { kind: "has-history" as const };
      }
      const [removed] = await tx
        .delete(tasksTable)
        .where(eq(tasksTable.id, task.id))
        .returning({ id: tasksTable.id });
      if (!removed) return { kind: "not-found" as const };
      await writeAudit(tx, {
        actorId: req.factionUser!.id,
        actorNickname: req.factionUser!.nickname,
        category: "tasks",
        action: "task.deleted",
        entityType: "task",
        entityId: task.id,
        entityLabel: task.title,
      });
      return { kind: "deleted" as const };
    });
    if (deleted.kind === "not-found") {
      res.status(404).json({ error: "Задание не найдено." });
      return;
    }
    if (deleted.kind === "has-history") {
      res.status(409).json({ error: "У задания есть история. Используйте отмену, чтобы сохранить её." });
      return;
    }
    res.json(DeleteTaskResponse.parse({ ok: true }));
  },
);

export default router;
