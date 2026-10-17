import { and, desc, eq, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateMemberBody,
  CreateMemberResponse,
  ListMembersResponse,
  UpdateMemberBody,
  UpdateMemberParams,
  UpdateMemberResponse,
} from "@workspace/api-zod";
import { authSessionsTable, db, membersTable } from "@workspace/db";
import { writeAudit } from "../lib/audit";
import {
  hashPassword,
  normalizeNickname,
  requireReadyAuth,
  requireManager,
} from "../lib/auth";
import { randomBytes } from "node:crypto";

const router: IRouter = Router();
const nicknamePattern = /^[A-Za-z0-9_]{3,32}$/;

function toPublicMember(member: typeof membersTable.$inferSelect) {
  return {
    id: member.id,
    nickname: member.nickname,
    role: member.role,
    rank: member.rank,
    status: member.status,
    createdAt: member.createdAt,
    lastLogin: member.lastLogin,
  };
}

router.get("/members", requireReadyAuth, async (req, res): Promise<void> => {
  const viewer = req.factionUser!;
  const rows = await db
    .select()
    .from(membersTable)
    .where(
      and(
        ne(membersTable.status, "removed"),
        viewer.role === "employee" ? eq(membersTable.id, viewer.id) : undefined,
      ),
    )
    .orderBy(desc(membersTable.createdAt));
  res.json(ListMembersResponse.parse(rows.map(toPublicMember)));
});

router.post("/members", requireReadyAuth, async (req, res): Promise<void> => {
  const viewer = req.factionUser!;
  if (!requireManager(req, res)) return;

  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Проверьте ник, звание и роль." });
    return;
  }
  if (!nicknamePattern.test(parsed.data.nickname.trim())) {
    res.status(400).json({
      error: "Ник должен содержать 3–32 латинских букв, цифр или подчёркиваний.",
    });
    return;
  }
  if (viewer.role !== "leader" && parsed.data.role !== "employee") {
    res.status(403).json({ error: "Только лидер может назначать администраторов." });
    return;
  }

  const nickname = parsed.data.nickname.trim();
  const nicknameNormalized = normalizeNickname(nickname);
  const temporaryPassword = randomBytes(10).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const [member] = await db.transaction(async (tx) => {
      const created = await tx
        .insert(membersTable)
        .values({
          nickname,
          nicknameNormalized,
          passwordHash,
          role: parsed.data.role,
          rank: parsed.data.rank.trim(),
          status: "active",
          mustChangePassword: true,
        })
        .returning();
      const account = created[0]!;
      await writeAudit(tx, {
        actorId: viewer.id,
        actorNickname: viewer.nickname,
        category: "accounts",
        action: "account.created",
        entityType: "member",
        entityId: account.id,
        entityLabel: `Создан аккаунт: ${account.nickname}`,
        targetMemberId: account.id,
        targetMemberNickname: account.nickname,
        details: { role: account.role, rank: account.rank },
      });
      return created;
    });
    req.log.info({ memberId: member.id, role: member.role }, "Faction member created");
    res.status(201).json(
      CreateMemberResponse.parse({
        member: toPublicMember(member),
        temporaryPassword,
      }),
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "Аккаунт с таким ником уже существует." });
      return;
    }
    throw error;
  }
});

router.patch(
  "/members/:id",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const viewer = req.factionUser!;
    if (!requireManager(req, res)) return;
    const params = UpdateMemberParams.safeParse(req.params);
    const body = UpdateMemberBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Некорректные данные сотрудника." });
      return;
    }

    const [target] = await db
      .select({
        id: membersTable.id,
        nickname: membersTable.nickname,
        role: membersTable.role,
        rank: membersTable.rank,
        status: membersTable.status,
      })
      .from(membersTable)
      .where(eq(membersTable.id, params.data.id))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Сотрудник не найден." });
      return;
    }
    if (target.role === "leader" || (viewer.role === "admin" && target.role !== "employee")) {
      res.status(403).json({ error: "Управлять этим аккаунтом может только лидер." });
      return;
    }
    if (body.data.role && viewer.role !== "leader") {
      res.status(403).json({ error: "Менять роли может только лидер." });
      return;
    }
    if (body.data.status === "blocked" && target.id === viewer.id) {
      res.status(400).json({ error: "Нельзя заблокировать собственный аккаунт." });
      return;
    }
    if (Object.keys(body.data).length === 0) {
      res.status(400).json({ error: "Укажите хотя бы одно изменение." });
      return;
    }

    const update: Partial<typeof membersTable.$inferInsert> = {};
    if (body.data.rank !== undefined) update.rank = body.data.rank.trim();
    if (body.data.role !== undefined) update.role = body.data.role;
    if (body.data.status !== undefined) update.status = body.data.status;

    const [member] = await db.transaction(async (tx) => {
      const [updatedMember] = await tx
        .update(membersTable)
        .set(update)
        .where(eq(membersTable.id, target.id))
        .returning();
      if (!updatedMember) return [];
      if (updatedMember.status === "blocked") {
        await tx
          .delete(authSessionsTable)
          .where(eq(authSessionsTable.memberId, updatedMember.id));
      }
      const roleChanged = target.role !== updatedMember.role;
      await writeAudit(tx, {
        actorId: viewer.id,
        actorNickname: viewer.nickname,
        category: "accounts",
        action: roleChanged ? "account.role_changed" : "account.updated",
        entityType: "member",
        entityId: updatedMember.id,
        entityLabel: `Изменён аккаунт: ${updatedMember.nickname}`,
        targetMemberId: updatedMember.id,
        targetMemberNickname: updatedMember.nickname,
        details: {
          before: {
            role: target.role,
            status: target.status,
            rank: target.rank,
          },
          after: {
            role: updatedMember.role,
            status: updatedMember.status,
            rank: updatedMember.rank,
          },
        },
      });
      return [updatedMember];
    });
    if (!member) {
      res.status(404).json({ error: "Сотрудник не найден." });
      return;
    }
    res.json(UpdateMemberResponse.parse(toPublicMember(member)));
  },
);

router.delete(
  "/members/:id",
  requireReadyAuth,
  async (req, res): Promise<void> => {
    const viewer = req.factionUser!;
    if (!requireManager(req, res)) return;

    const params = UpdateMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Некорректный идентификатор сотрудника." });
      return;
    }

    const [target] = await db
      .select({
        id: membersTable.id,
        nickname: membersTable.nickname,
        role: membersTable.role,
        status: membersTable.status,
      })
      .from(membersTable)
      .where(eq(membersTable.id, params.data.id))
      .limit(1);
    if (!target || target.status === "removed") {
      res.status(404).json({ error: "Сотрудник не найден в составе." });
      return;
    }
    if (target.role !== "employee") {
      res.status(403).json({ error: "Удалять из состава можно только сотрудников." });
      return;
    }

    const removed = await db.transaction(async (tx) => {
      const [updatedMember] = await tx
        .update(membersTable)
        .set({ status: "removed" })
        .where(
          and(
            eq(membersTable.id, target.id),
            eq(membersTable.role, "employee"),
            ne(membersTable.status, "removed"),
          ),
        )
        .returning();
      if (!updatedMember) return false;

      await tx
        .delete(authSessionsTable)
        .where(eq(authSessionsTable.memberId, updatedMember.id));
      await writeAudit(tx, {
        actorId: viewer.id,
        actorNickname: viewer.nickname,
        category: "accounts",
        action: "account.removed",
        entityType: "member",
        entityId: updatedMember.id,
        entityLabel: `Исключён из состава: ${updatedMember.nickname}`,
        targetMemberId: updatedMember.id,
        targetMemberNickname: updatedMember.nickname,
        details: {
          before: { role: target.role, status: target.status },
          after: { role: updatedMember.role, status: updatedMember.status },
          historyPreserved: true,
        },
      });
      return true;
    });

    if (!removed) {
      res.status(404).json({ error: "Сотрудник не найден в составе." });
      return;
    }
    res.json({ ok: true });
  },
);

export default router;
