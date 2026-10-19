import { eq, sql } from "drizzle-orm";
import { db, membersTable, pointTransactionsTable } from "@workspace/db";
import { writeAudit } from "./audit";
import { standardPointsRequestKey, type StandardPointsSource } from "./points-rules";

type PointsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PointSource = StandardPointsSource | "manual";

type RecordPointChangeInput = {
  memberId: string;
  memberNickname: string;
  delta: number;
  reason: string;
  source: PointSource;
  assignmentId?: string;
  actorId: string;
  actorNickname: string;
};

export async function recordPointChange(
  tx: PointsTransaction,
  input: RecordPointChangeInput,
): Promise<boolean> {
  const requestKey = input.assignmentId && input.source !== "manual"
    ? standardPointsRequestKey(input.assignmentId, input.source)
    : null;
  const [transaction] = await tx
    .insert(pointTransactionsTable)
    .values({
      memberId: input.memberId,
      delta: input.delta,
      reason: input.reason,
      source: input.source,
      assignmentId: input.assignmentId ?? null,
      actorId: input.actorId,
      actorNickname: input.actorNickname,
      requestKey,
    })
    .onConflictDoNothing({ target: pointTransactionsTable.requestKey })
    .returning({ id: pointTransactionsTable.id });
  if (!transaction) return false;

  const [updatedMember] = await tx
    .update(membersTable)
    .set({ points: sql`${membersTable.points} + ${input.delta}` })
    .where(eq(membersTable.id, input.memberId))
    .returning({ points: membersTable.points });
  if (!updatedMember) throw new Error("Не удалось обновить баланс баллов сотрудника.");

  const isAutomatic = input.source !== "manual";
  await writeAudit(tx, {
    actorId: input.actorId,
    actorNickname: input.actorNickname,
    category: isAutomatic ? "standards" : "accounts",
    action: input.delta > 0 ? "points.earned" : "points.deducted",
    entityType: "point_transaction",
    entityId: transaction.id,
    entityLabel: (input.delta > 0 ? "Начисление " : "Списание ") + Math.abs(input.delta) + " баллов: " + input.memberNickname,
    targetMemberId: input.memberId,
    targetMemberNickname: input.memberNickname,
    reason: input.reason,
    details: {
      delta: input.delta,
      source: input.source,
      assignmentId: input.assignmentId ?? null,
      pointsAfter: updatedMember.points,
    },
  });
  return true;
}
