import { count, eq, sql } from "drizzle-orm";
import { db, membersTable } from "@workspace/db";
import { hashPassword, normalizeNickname } from "./lib/auth";
import { writeAudit } from "./lib/audit";

export const INITIAL_LEADER_NICKNAME = "Winston_Goodman";
export const INITIAL_LEADER_PASSWORD = "1234";

/**
 * Create the first leader on the first app visit, without requiring a shell.
 * The transaction lock and in-transaction check make this safe across
 * concurrent requests and multiple server instances.
 */
export async function ensureInitialLeader(): Promise<boolean> {
  const [existingMember] = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .limit(1);
  if (existingMember) return false;

  const passwordHash = await hashPassword(INITIAL_LEADER_PASSWORD);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(813492771)`);
    const [existing] = await tx
      .select({ total: count() })
      .from(membersTable);
    if (Number(existing?.total ?? 0) > 0) return false;

    const [leader] = await tx
      .insert(membersTable)
      .values({
        nickname: INITIAL_LEADER_NICKNAME,
        nicknameNormalized: normalizeNickname(INITIAL_LEADER_NICKNAME),
        passwordHash,
        role: "leader",
        rank: "Лидер",
        status: "active",
        mustChangePassword: true,
      })
      .returning({ id: membersTable.id, nickname: membersTable.nickname });

    await writeAudit(tx, {
      actorId: leader!.id,
      actorNickname: leader!.nickname,
      category: "accounts",
      action: "account.created",
      entityType: "member",
      entityId: leader!.id,
      entityLabel: `Создан первый аккаунт лидера: ${leader!.nickname}`,
      targetMemberId: leader!.id,
      targetMemberNickname: leader!.nickname,
      details: { role: "leader", initialBootstrap: true },
    });
    return true;
  });
}

export async function isInitialLeaderSetupComplete(): Promise<boolean> {
  const [leader] = await db
    .select({ mustChangePassword: membersTable.mustChangePassword })
    .from(membersTable)
    .where(eq(membersTable.role, "leader"))
    .limit(1);
  return Boolean(leader && !leader.mustChangePassword);
}
