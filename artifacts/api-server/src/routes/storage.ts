import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import express from "express";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  db,
  disciplineTable,
  eventSubmissionFilesTable,
  eventSubmissionsTable,
  standardAssignmentsTable,
  standardSubmissionFilesTable,
  standardSubmissionsTable,
  taskSubmissionFilesTable,
  taskSubmissionsTable,
  tasksTable,
  uploadsTable,
} from "@workspace/db";
import { requireReadyAuth } from "../lib/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  MAX_SCREENSHOT_BYTES,
  validateDeclaredImage,
  verifyImageBytes,
} from "../lib/uploadValidation";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

router.post(
  "/storage/uploads/request-url",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Можно загрузить JPG, PNG или WebP до 25 МБ." });
      return;
    }
    const declaredError = validateDeclaredImage(
      parsed.data.name,
      parsed.data.size,
      parsed.data.contentType,
    );
    if (declaredError) {
      res.status(400).json({ error: declaredError });
      return;
    }

    try {
      const uploadId = randomUUID();
      const { uploadURL, objectPath } =
        await objectStorage.createUploadTarget(uploadId);
      if (!objectPath.startsWith("/objects/")) {
        req.log.error({ objectPath }, "Storage returned an invalid object path");
        res.status(500).json({ error: "Не удалось подготовить хранилище." });
        return;
      }
      const [upload] = await db
        .insert(uploadsTable)
        .values({
          id: uploadId,
          memberId: req.factionUser!.id,
          objectPath,
          originalName: parsed.data.name,
          contentType: parsed.data.contentType,
          size: parsed.data.size,
          verificationStatus: "pending",
        })
        .returning({ id: uploadsTable.id });
      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          uploadId: upload!.id,
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Could not create a screenshot upload URL");
      res.status(500).json({ error: "Не удалось подготовить загрузку скриншота." });
    }
  },
);

router.put(
  "/storage/uploads/transfer/:uploadId",
  requireReadyAuth,
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: MAX_SCREENSHOT_BYTES,
  }),
  async (req, res): Promise<void> => {
    if (!objectStorage.isDropboxEnabled()) {
      res.status(404).json({ error: "Маршрут загрузки не найден." });
      return;
    }
    const uploadId = req.params.uploadId;
    if (typeof uploadId !== "string") {
      res.status(400).json({ error: "Некорректная загрузка." });
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
      res.status(400).json({ error: "Некорректная загрузка." });
      return;
    }
    const [upload] = await db
      .select()
      .from(uploadsTable)
      .where(eq(uploadsTable.id, uploadId))
      .limit(1);
    if (!upload || upload.memberId !== req.factionUser!.id) {
      res.status(404).json({ error: "Загрузка не найдена." });
      return;
    }
    if (upload.verificationStatus !== "pending") {
      res.status(409).json({ error: "Загрузка уже обработана." });
      return;
    }
    if (req.get("content-type")?.split(";")[0]?.trim() !== upload.contentType) {
      res.status(415).json({ error: "Тип загружаемого файла не совпадает с заявленным." });
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Тело запроса должно содержать изображение." });
      return;
    }
    const verified = verifyImageBytes(upload, req.body);
    if ("error" in verified) {
      res.status(422).json({ error: verified.error });
      return;
    }

    try {
      await objectStorage.storeObject(
        upload.objectPath,
        req.body,
        verified.verified.detectedContentType,
      );
      res.status(204).end();
    } catch (error) {
      req.log.error({ err: error, uploadId }, "Screenshot transfer to private storage failed");
      res.status(503).json({ error: "Не удалось сохранить скриншот. Повторите попытку." });
    }
  },
);

router.get(
  "/storage/objects/*path",
  requireReadyAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const wildcard = req.params.path;
      const suffix = Array.isArray(wildcard) ? wildcard.join("/") : wildcard;
      const objectPath = `/objects/${suffix}`;
      const [upload] = await db
        .select()
        .from(uploadsTable)
        .where(eq(uploadsTable.objectPath, objectPath))
        .limit(1);
      if (!upload) {
        res.status(404).json({ error: "Файл не найден." });
        return;
      }

      const viewer = req.factionUser!;
      const isManager = viewer.role === "leader" || viewer.role === "admin";
      const [standardFile] = await db
        .select({ id: standardSubmissionFilesTable.id })
        .from(standardSubmissionFilesTable)
        .innerJoin(
          standardSubmissionsTable,
          eq(
            standardSubmissionFilesTable.submissionId,
            standardSubmissionsTable.id,
          ),
        )
        .innerJoin(
          standardAssignmentsTable,
          eq(
            standardSubmissionsTable.assignmentId,
            standardAssignmentsTable.id,
          ),
        )
        .where(
          and(
            eq(standardSubmissionFilesTable.uploadId, upload.id),
            isManager
              ? undefined
              : eq(standardAssignmentsTable.assigneeId, viewer.id),
          ),
        )
        .limit(1);
      const [taskFile] = await db
        .select({ id: taskSubmissionFilesTable.id })
        .from(taskSubmissionFilesTable)
        .innerJoin(
          taskSubmissionsTable,
          eq(taskSubmissionFilesTable.submissionId, taskSubmissionsTable.id),
        )
        .innerJoin(
          tasksTable,
          eq(taskSubmissionsTable.taskId, tasksTable.id),
        )
        .where(
          and(
            eq(taskSubmissionFilesTable.uploadId, upload.id),
            isManager ? undefined : eq(tasksTable.assigneeId, viewer.id),
          ),
        )
        .limit(1);
      const [eventFile] = await db
        .select({ id: eventSubmissionFilesTable.id })
        .from(eventSubmissionFilesTable)
        .innerJoin(
          eventSubmissionsTable,
          eq(
            eventSubmissionFilesTable.submissionId,
            eventSubmissionsTable.id,
          ),
        )
        .where(
          and(
            eq(eventSubmissionFilesTable.uploadId, upload.id),
            isManager
              ? undefined
              : eq(eventSubmissionsTable.memberId, viewer.id),
          ),
        )
        .limit(1);
      const [legacyTask] = await db
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.evidencePath, objectPath),
            isManager ? undefined : eq(tasksTable.assigneeId, viewer.id),
          ),
        )
        .limit(1);
      const [legacyDiscipline] = await db
        .select({ id: disciplineTable.id })
        .from(disciplineTable)
        .where(
          and(
            eq(disciplineTable.evidencePath, objectPath),
            isManager ? undefined : eq(disciplineTable.memberId, viewer.id),
          ),
        )
        .limit(1);
      const canRead =
        upload.memberId === viewer.id ||
        Boolean(standardFile || taskFile || eventFile || legacyTask || legacyDiscipline);
      if (!canRead) {
        res.status(403).json({ error: "Нет доступа к этому файлу." });
        return;
      }
      if (
        upload.verificationStatus !== "verified" ||
        !upload.detectedContentType
      ) {
        res.status(403).json({ error: "Файл ещё не прошёл проверку содержимого." });
        return;
      }

      const file = await objectStorage.getObjectEntityFile(objectPath);
      const response = await objectStorage.downloadObject(file, 300);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.setHeader("Content-Type", upload.detectedContentType);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Файл не найден." });
        return;
      }
      req.log.error({ err: error }, "Could not serve a faction screenshot");
      res.status(500).json({ error: "Не удалось открыть файл." });
    }
  },
);

export default router;
