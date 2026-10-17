import { and, eq, gt, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ChangePasswordBody,
  ChangePasswordResponse,
  GetCurrentUserResponse,
  GetSetupStatusResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
} from "@workspace/api-zod";
import {
  authSessionsTable,
  db,
  loginAttemptsTable,
  membersTable,
} from "@workspace/db";
import {
  clearSessionCookie,
  hashPassword,
  hashRateLimitKey,
  hashSessionToken,
  issueSession,
  normalizeNickname,
  requireAuth,
  verifyPassword,
} from "../lib/auth";
import { writeAudit } from "../lib/audit";
import {
  ensureInitialLeader,
  isInitialLeaderSetupComplete,
} from "../initial-leader";

const router: IRouter = Router();
const failureWindowMs = 15 * 60 * 1000;
const lockDurationMs = 15 * 60 * 1000;
const maxFailures = 8;
const dummyPasswordHash =
  "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

router.get("/auth/setup-status", async (_req, res): Promise<void> => {
  await ensureInitialLeader();
  res.json(
    GetSetupStatusResponse.parse({
      setupComplete: await isInitialLeaderSetupComplete(),
    }),
  );
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Проверьте ник и пароль." });
    return;
  }

  const nicknameNormalized = normalizeNickname(parsed.data.nickname);
  const bucketKey = hashRateLimitKey(`${req.ip ?? "unknown"}:${nicknameNormalized}`);
  const now = new Date();
  const cutoff = new Date(now.getTime() - failureWindowMs);
  const lockedUntil = new Date(now.getTime() + lockDurationMs);
  const [attempt] = await db
    .insert(loginAttemptsTable)
    .values({
      bucketKey,
      failures: 1,
      windowStartedAt: now,
    })
    .onConflictDoUpdate({
      target: loginAttemptsTable.bucketKey,
      set: {
        failures: sql`CASE WHEN ${loginAttemptsTable.windowStartedAt} < ${cutoff} THEN 1 ELSE ${loginAttemptsTable.failures} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${loginAttemptsTable.windowStartedAt} < ${cutoff} THEN ${now} WHEN ${loginAttemptsTable.failures} + 1 >= ${maxFailures} AND ${loginAttemptsTable.lockedUntil} IS NULL THEN ${now} ELSE ${loginAttemptsTable.windowStartedAt} END`,
        lockedUntil: sql`CASE WHEN ${loginAttemptsTable.windowStartedAt} < ${cutoff} THEN NULL WHEN ${loginAttemptsTable.failures} + 1 >= ${maxFailures} AND ${loginAttemptsTable.lockedUntil} IS NULL THEN ${lockedUntil} ELSE ${loginAttemptsTable.lockedUntil} END`,
      },
    })
    .returning({
      failures: loginAttemptsTable.failures,
      lockedUntil: loginAttemptsTable.lockedUntil,
    });

  if (
    attempt?.failures >= maxFailures ||
    (attempt?.lockedUntil && attempt.lockedUntil > now)
  ) {
    res.status(429).json({
      error: "Слишком много попыток. Повторите вход позже.",
    });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.nicknameNormalized, nicknameNormalized))
    .limit(1);
  const passwordMatches = await verifyPassword(
    parsed.data.password,
    member?.passwordHash ?? dummyPasswordHash,
  );

  if (!member || member.status !== "active" || !passwordMatches) {
    req.log.warn({ nicknameNormalized }, "Faction login rejected");
    res.status(401).json({ error: "Неверный ник или пароль." });
    return;
  }

  await db
    .delete(loginAttemptsTable)
    .where(eq(loginAttemptsTable.bucketKey, bucketKey));
  await db
    .update(membersTable)
    .set({ lastLogin: now })
    .where(eq(membersTable.id, member.id));
  await issueSession(member.id, res);

  res.json(
    LoginResponse.parse({
      id: member.id,
      nickname: member.nickname,
      role: member.role,
      rank: member.rank,
      status: member.status,
      mustChangePassword: member.mustChangePassword,
    }),
  );
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json(GetCurrentUserResponse.parse(req.factionUser));
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  if (req.factionSessionId) {
    await db
      .delete(authSessionsTable)
      .where(eq(authSessionsTable.id, req.factionSessionId));
  }
  clearSessionCookie(res);
  res.json(LogoutResponse.parse({ ok: true }));
});

router.post(
  "/auth/change-password",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ChangePasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Новый пароль должен содержать не менее 10 символов.",
      });
      return;
    }

    const [member] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, req.factionUser!.id))
      .limit(1);
    if (
      !member ||
      !(await verifyPassword(parsed.data.currentPassword, member.passwordHash))
    ) {
      res.status(400).json({ error: "Текущий пароль указан неверно." });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.transaction(async (tx) => {
      await tx
        .update(membersTable)
        .set({ passwordHash, mustChangePassword: false })
        .where(eq(membersTable.id, member.id));
      await tx
        .delete(authSessionsTable)
        .where(eq(authSessionsTable.memberId, member.id));
      await writeAudit(tx, {
        actorId: member.id,
        actorNickname: member.nickname,
        category: "accounts",
        action: "account.password_changed",
        entityType: "member",
        entityId: member.id,
        entityLabel: `Обновлён пароль: ${member.nickname}`,
        targetMemberId: member.id,
        targetMemberNickname: member.nickname,
      });
    });
    await issueSession(member.id, res);
    res.json(ChangePasswordResponse.parse({ ok: true }));
  },
);

export default router;
