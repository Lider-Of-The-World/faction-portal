import { and, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Router, type IRouter } from "express";
import {
  CreateDisciplineRecordBody,
  CreateDisciplineRecordResponse,
  ListDisciplineResponse,
  RevokeDisciplineRecordBody,
  RevokeDisciplineRecordParams,
  RevokeDisciplineRecordResponse,
} from "@workspace/api-zod";
import {
  db,
  disciplineTable,
  membersTable,
  uploadsTable,
} from "@workspace/db";
import { writeAudit } from "../lib/audit";
import { requireManager, requireReadyAuth } from "../lib/auth";
import { planDisciplineIssue } from "../lib/discipline-rules";
import { ObjectStorageService } from "../lib/objectStorage";
import { verifyStoredImage } from "../lib/uploadValidation";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const issuerMembers = alias(membersTable, "discipline_issuer");

type DisciplineQuery = {
  memberId?: string;
  type?: "warning" | "reprimand";
  status?: "active" | "revoked" | "converted";
};

async function selectRecords(filters: DisciplineQuery = {}) {
  const conditions = [];
  if (filters.memberId) {
    conditions.push(eq(disciplineTable.memberId, filters.memberId));
  }
  if (filters.type) {
    conditions.push(eq(disciplineTable.type, filters.type));
  }
  if (filters.status) {
    conditions.push(eq(disciplineTable.status, filters.status));
  }

  return db
    .select({
      id: disciplineTable.id,
      memberId: disciplineTable.memberId,
      memberNickname: membersTable.nickname,
      type: disciplineTable.type,
      status: disciplineTable.status,
      reason: disciplineTable.reason,
      points: disciplineTable.points,
      evidencePath: disciplineTable.evidencePath,
      issuedById: disciplineTable.issuedById,
      issuedByNickname: sql<string>`COALESCE(NULLIF(${disciplineTable.issuedByNickname}, ''), ${issuerMembers.nickname}, 'Удалённый аккаунт')`,
      createdAt: disciplineTable.createdAt,
      revokedAt: disciplineTable.revokedAt,
      revokedById: disciplineTable.revokedById,
      revokedByNickname: disciplineTable.revokedByNickname,
      revocationReason: disciplineTable.revocationReason,
      convertedAt: disciplineTable.convertedAt,
      convertedById: disciplineTable.convertedById,
      convertedByNickname: disciplineTable.convertedByNickname,
      conversionReason: disciplineTable.conversionReason,
      convertedToId: disciplineTable.convertedToId,
      maxLevelReachedAt: membersTable.disciplineMaxReachedAt,
    })
    .from(disciplineTable)
    .innerJoin(membersTable, eq(disciplineTable.memberId, membersTable.id))
    .leftJoin(issuerMembers, eq(disciplineTable.issuedById, issuerMembers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(disciplineTable.createdAt));
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return String(error.code);
}

router.get("/discipline", requireReadyAuth, async (req, res): Promise<void> => {
  const rawMemberId = req.query.memberId;
  const rawType = req.query.type;
  const rawStatus = req.query.status;
  const filters: DisciplineQuery = {};

  if (rawMemberId !== undefined) {
    if (typeof rawMemberId !== "string" || !uuidPattern.test(rawMemberId)) {
      res.status(400).json({ error: "Некорректный фильтр сотрудника." });
      return;
    }
    filters.memberId = rawMemberId;
  }
  if (rawType !== undefined) {
    if (rawType !== "warning" && rawType !== "reprimand") {
      res.status(400).json({ error: "Некорректный тип взыскания." });
      return;
    }
    filters.type = rawType;
  }
  if (rawStatus !== undefined) {
    if (!["active", "revoked", "converted"].includes(String(rawStatus))) {
      res.status(400).json({ error: "Некорректный статус взыскания." });
      return;
    }
    filters.status = String(rawStatus) as NonNullable<DisciplineQuery["status"]>;
  }

  if (req.factionUser!.role === "employee") {
    if (filters.memberId && filters.memberId !== req.factionUser!.id) {
      res.status(404).json({ error: "История сотрудника не найдена." });
      return;
    }
    filters.memberId = req.factionUser!.id;
  }

  const records = await selectRecords(filters);
  res.json(ListDisciplineResponse.parse(records));
});

router.post("/discipline", requireReadyAuth, async (req, res): Promise<void> => {
  if (!requireManager(req, res)) return;
  const parsed = CreateDisciplineRecordBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.reason.trim()) {
    res.status(400).json({
      error: "Проверьте сотрудника, тип взыскания, ключ запроса и причину.",
    });
    return;
  }

  if (parsed.data.evidencePath) {
    const [upload] = await db
      .select()
      .from(uploadsTable)
      .where(eq(uploadsTable.objectPath, parsed.data.evidencePath))
      .limit(1);
    if (!upload || upload.memberId !== req.factionUser!.id) {
      res.status(400).json({ error: "Этот файл нельзя прикрепить к записи." });
      return;
    }
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
        return;
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
        "Discipline evidence verification failed",
      );
      res.status(422).json({ error: "Файл не найден или не прошёл проверку." });
      return;
    }
  }

  const viewer = req.factionUser!;
  let result:
    | { kind: "created" | "replayed"; id: string }
    | { kind: "not-found" }
    | { kind: "inactive" }
    | { kind: "limit"; limit: "warning" | "reprimand" }
    | { kind: "invalid-state" }
    | { kind: "idempotency-conflict" };
  try {
    result = await db.transaction(async (tx) => {
      // Serialize all sanction changes for this employee, including concurrent
      // requests arriving from separate API workers.
      await tx.execute(
        sql`SELECT id FROM faction_members WHERE id = ${parsed.data.memberId} FOR UPDATE`,
      );

      const [previousRequest] = await tx
        .select({
          id: disciplineTable.id,
          memberId: disciplineTable.memberId,
        })
        .from(disciplineTable)
        .where(eq(disciplineTable.requestKey, parsed.data.requestId))
        .limit(1);
      if (previousRequest) {
        return previousRequest.memberId === parsed.data.memberId
          ? { kind: "replayed" as const, id: previousRequest.id }
          : { kind: "idempotency-conflict" as const };
      }

      const [member] = await tx
        .select({
          id: membersTable.id,
          nickname: membersTable.nickname,
          role: membersTable.role,
          status: membersTable.status,
        })
        .from(membersTable)
        .where(eq(membersTable.id, parsed.data.memberId))
        .limit(1);
      if (!member) return { kind: "not-found" as const };
      if (member.role !== "employee" || member.status !== "active") {
        return { kind: "inactive" as const };
      }

      const [warnings] = await tx
        .select({ value: count() })
        .from(disciplineTable)
        .where(
          and(
            eq(disciplineTable.memberId, member.id),
            eq(disciplineTable.type, "warning"),
            eq(disciplineTable.status, "active"),
          ),
        );
      const [reprimands] = await tx
        .select({ value: count() })
        .from(disciplineTable)
        .where(
          and(
            eq(disciplineTable.memberId, member.id),
            eq(disciplineTable.type, "reprimand"),
            eq(disciplineTable.status, "active"),
          ),
        );

      const decision = planDisciplineIssue(
        {
          activeWarnings: Number(warnings?.value ?? 0),
          activeReprimands: Number(reprimands?.value ?? 0),
        },
        parsed.data.type,
      );
      if (!decision.allowed) {
        if (decision.code === "invalid_counts") {
          return { kind: "invalid-state" as const };
        }
        return {
          kind: "limit" as const,
          limit: decision.code === "warning_limit" ? "warning" : "reprimand",
        };
      }

      const now = new Date();
      let responseId: string;
      if (parsed.data.type === "warning" && decision.convertActiveWarnings) {
        const activeWarnings = await tx
          .select({
            id: disciplineTable.id,
            reason: disciplineTable.reason,
          })
          .from(disciplineTable)
          .where(
            and(
              eq(disciplineTable.memberId, member.id),
              eq(disciplineTable.type, "warning"),
              eq(disciplineTable.status, "active"),
            ),
          );
        if (activeWarnings.length !== 1) {
          return { kind: "invalid-state" as const };
        }

        const [reprimand] = await tx
          .insert(disciplineTable)
          .values({
            memberId: member.id,
            type: "reprimand",
            status: "active",
            reason: parsed.data.reason.trim(),
            points: 0,
            evidencePath: parsed.data.evidencePath ?? null,
            issuedById: viewer.id,
            issuedByNickname: viewer.nickname,
            requestKey: parsed.data.requestId,
          })
          .returning({ id: disciplineTable.id });
        if (!reprimand) throw new Error("Не удалось создать выговор.");

        const conversionReason =
          "Два активных предупреждения преобразованы в один активный выговор.";
        await tx
          .update(disciplineTable)
          .set({
            status: "converted",
            convertedAt: now,
            convertedById: viewer.id,
            convertedByNickname: viewer.nickname,
            conversionReason,
            convertedToId: reprimand.id,
          })
          .where(
            and(
              eq(disciplineTable.memberId, member.id),
              eq(disciplineTable.type, "warning"),
              eq(disciplineTable.status, "active"),
            ),
          );
        const [convertedWarning] = await tx
          .insert(disciplineTable)
          .values({
            memberId: member.id,
            type: "warning",
            status: "converted",
            reason: parsed.data.reason.trim(),
            points: 0,
            evidencePath: parsed.data.evidencePath ?? null,
            issuedById: viewer.id,
            issuedByNickname: viewer.nickname,
            convertedAt: now,
            convertedById: viewer.id,
            convertedByNickname: viewer.nickname,
            conversionReason,
            convertedToId: reprimand.id,
          })
          .returning({ id: disciplineTable.id });
        if (!convertedWarning) {
          throw new Error("Не удалось сохранить запись о конвертации предупреждения.");
        }
        await writeAudit(tx, {
          actorId: viewer.id,
          actorNickname: viewer.nickname,
          category: "discipline",
          action: "discipline.warning_converted",
          entityType: "discipline",
          entityId: reprimand.id,
          entityLabel: `Выговор для ${member.nickname}`,
          targetMemberId: member.id,
          targetMemberNickname: member.nickname,
          reason: parsed.data.reason.trim(),
          details: {
            convertedWarningIds: [
              ...activeWarnings.map((warning) => warning.id),
              convertedWarning.id,
            ],
            reprimandId: reprimand.id,
            activeReprimands: decision.nextActiveReprimands,
          },
        });
        responseId = reprimand.id;
      } else {
        const [created] = await tx
          .insert(disciplineTable)
          .values({
            memberId: member.id,
            type: parsed.data.type,
            status: "active",
            reason: parsed.data.reason.trim(),
            points: 0,
            evidencePath: parsed.data.evidencePath ?? null,
            issuedById: viewer.id,
            issuedByNickname: viewer.nickname,
            requestKey: parsed.data.requestId,
          })
          .returning({ id: disciplineTable.id });
        if (!created) throw new Error("Не удалось создать взыскание.");
        const action =
          parsed.data.type === "warning"
            ? "discipline.warning_issued"
            : "discipline.reprimand_issued";
        await writeAudit(tx, {
          actorId: viewer.id,
          actorNickname: viewer.nickname,
          category: "discipline",
          action,
          entityType: "discipline",
          entityId: created.id,
          entityLabel: `${parsed.data.type === "warning" ? "Предупреждение" : "Выговор"} для ${member.nickname}`,
          targetMemberId: member.id,
          targetMemberNickname: member.nickname,
          reason: parsed.data.reason.trim(),
          details: {
            type: parsed.data.type,
            activeWarnings: decision.nextActiveWarnings,
            activeReprimands: decision.nextActiveReprimands,
          },
        });
        responseId = created.id;
      }

      if (decision.maxLevelReached) {
        await tx
          .update(membersTable)
          .set({
            disciplineMaxReachedAt: sql`COALESCE(${membersTable.disciplineMaxReachedAt}, ${now})`,
          })
          .where(eq(membersTable.id, member.id));
        await writeAudit(tx, {
          actorId: viewer.id,
          actorNickname: viewer.nickname,
          category: "discipline",
          action: "discipline.max_level_reached",
          entityType: "member",
          entityId: member.id,
          entityLabel: `Максимальный дисциплинарный уровень: ${member.nickname}`,
          targetMemberId: member.id,
          targetMemberNickname: member.nickname,
          reason: "Достигнут предел в три активных выговора; автоматическое увольнение не выполняется.",
          details: { activeReprimands: 3, automaticDismissal: false },
        });
      }

      return { kind: "created" as const, id: responseId };
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      res.status(409).json({
        error: "Этот ключ запроса уже использован. Обновите форму и повторите действие.",
      });
      return;
    }
    throw error;
  }

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Сотрудник не найден." });
    return;
  }
  if (result.kind === "inactive") {
    res.status(400).json({ error: "Взыскание можно назначить только активному сотруднику." });
    return;
  }
  if (result.kind === "invalid-state") {
    res.status(409).json({ error: "Состояние дисциплинарного реестра некорректно; начисление не выполнено." });
    return;
  }
  if (result.kind === "idempotency-conflict") {
    res.status(409).json({ error: "Ключ запроса уже применён к другой записи." });
    return;
  }
  if (result.kind === "limit") {
    res.status(409).json({
      error:
        result.limit === "warning"
          ? "У сотрудника уже есть два активных предупреждения."
          : "Достигнут предел в три активных выговора. Четвёртый выговор не создаётся.",
    });
    return;
  }

  const [complete] = await selectRecords({
    memberId: parsed.data.memberId,
  }).then((records) => records.filter((record) => record.id === result.id));
  if (!complete) {
    res.status(500).json({ error: "Взыскание создано, но его не удалось загрузить." });
    return;
  }
  res
    .status(result.kind === "created" ? 201 : 200)
    .json(CreateDisciplineRecordResponse.parse(complete));
});

router.post(
  "/discipline/:id/revoke",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    if (!requireManager(req, res)) return;
    const params = RevokeDisciplineRecordParams.safeParse(req.params);
    const body = RevokeDisciplineRecordBody.safeParse(req.body);
    if (!params.success || !body.success || !body.data.reason.trim()) {
      res.status(400).json({ error: "Для снятия взыскания обязательно укажите причину." });
      return;
    }

    const viewer = req.factionUser!;
    const revoked = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: disciplineTable.id,
          memberId: disciplineTable.memberId,
          memberNickname: membersTable.nickname,
          type: disciplineTable.type,
          status: disciplineTable.status,
          reason: disciplineTable.reason,
        })
        .from(disciplineTable)
        .innerJoin(membersTable, eq(disciplineTable.memberId, membersTable.id))
        .where(eq(disciplineTable.id, params.data.id))
        .limit(1);
      if (!current) return { kind: "not-found" as const };

      await tx.execute(
        sql`SELECT id FROM faction_members WHERE id = ${current.memberId} FOR UPDATE`,
      );
      const [activeRecord] = await tx
        .update(disciplineTable)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedById: viewer.id,
          revokedByNickname: viewer.nickname,
          revocationReason: body.data.reason.trim(),
        })
        .where(
          and(
            eq(disciplineTable.id, current.id),
            eq(disciplineTable.status, "active"),
          ),
        )
        .returning({ id: disciplineTable.id });
      if (!activeRecord) return { kind: "already-inactive" as const };

      await writeAudit(tx, {
        actorId: viewer.id,
        actorNickname: viewer.nickname,
        category: "discipline",
        action: "discipline.revoked",
        entityType: "discipline",
        entityId: current.id,
        entityLabel: `${current.type === "warning" ? "Предупреждение" : "Выговор"} для ${current.memberNickname}`,
        targetMemberId: current.memberId,
        targetMemberNickname: current.memberNickname,
        reason: body.data.reason.trim(),
        details: { type: current.type, originalReason: current.reason },
      });
      return { kind: "revoked" as const };
    });

    if (revoked.kind === "not-found") {
      res.status(404).json({ error: "Запись взыскания не найдена." });
      return;
    }
    if (revoked.kind === "already-inactive") {
      res.status(409).json({ error: "Снять можно только активное взыскание." });
      return;
    }

    const [record] = await selectRecords().then((records) =>
      records.filter((item) => item.id === params.data.id),
    );
    res.json(RevokeDisciplineRecordResponse.parse(record));
  },
);

export default router;
