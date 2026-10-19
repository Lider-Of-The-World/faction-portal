import { and, count, eq } from "drizzle-orm";
import { db, disciplineTable, membersTable } from "@workspace/db";
import { writeAudit } from "./audit";
import { planDisciplineIssue } from "./discipline-rules";
import { standardFailureRequestKey } from "./standard-failure-rules";

type StandardDisciplineTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DisciplineType = "warning" | "reprimand";

export type StandardFailureDisciplineResult =
  | { kind: "issued"; type: DisciplineType; id: string }
  | { kind: "already-issued"; type: DisciplineType }
  | { kind: "ineligible" }
  | { kind: "limit"; code: "invalid_counts" | "warning_limit" | "reprimand_limit" };

export type StandardFailureDisciplineInput = {
  assignmentId: string;
  memberId: string;
  assignedById: string;
  assignedByNickname: string;
  standardTitle: string;
  reason: string;
};

export async function issueStandardFailureDiscipline(
  tx: StandardDisciplineTransaction,
  input: StandardFailureDisciplineInput,
): Promise<StandardFailureDisciplineResult> {
  const [member] = await tx
    .select({
      id: membersTable.id,
      nickname: membersTable.nickname,
      role: membersTable.role,
      status: membersTable.status,
      disciplineMaxReachedAt: membersTable.disciplineMaxReachedAt,
    })
    .from(membersTable)
    .where(eq(membersTable.id, input.memberId))
    .for("update");
  if (!member || member.role !== "employee" || member.status !== "active") {
    return { kind: "ineligible" };
  }

  const requestKey = standardFailureRequestKey(input.assignmentId);
  const [previousRequest] = await tx
    .select({ type: disciplineTable.type, memberId: disciplineTable.memberId })
    .from(disciplineTable)
    .where(eq(disciplineTable.requestKey, requestKey))
    .limit(1);
  if (previousRequest) {
    if (previousRequest.memberId !== member.id) {
      return { kind: "limit", code: "invalid_counts" };
    }
    return {
      kind: "already-issued",
      type: previousRequest.type === "reprimand" ? "reprimand" : "warning",
    };
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
    "warning",
  );
  if (!decision.allowed) return { kind: "limit", code: decision.code };

  const now = new Date();
  const actorNickname = input.assignedByNickname + " · автоматически";
  let issuedId: string;
  let issuedType: DisciplineType;

  if (decision.convertActiveWarnings) {
    const activeWarnings = await tx
      .select({ id: disciplineTable.id })
      .from(disciplineTable)
      .where(
        and(
          eq(disciplineTable.memberId, member.id),
          eq(disciplineTable.type, "warning"),
          eq(disciplineTable.status, "active"),
        ),
      );
    if (activeWarnings.length !== 1) {
      return { kind: "limit", code: "invalid_counts" };
    }

    const [reprimand] = await tx
      .insert(disciplineTable)
      .values({
        memberId: member.id,
        type: "reprimand",
        status: "active",
        reason: input.reason,
        points: 0,
        issuedById: input.assignedById,
        issuedByNickname: actorNickname,
        requestKey,
      })
      .returning({ id: disciplineTable.id });
    if (!reprimand) throw new Error("Не удалось создать выговор за норматив.");

    const conversionReason = "Два активных предупреждения преобразованы в один активный выговор.";
    await tx
      .update(disciplineTable)
      .set({
        status: "converted",
        convertedAt: now,
        convertedById: input.assignedById,
        convertedByNickname: actorNickname,
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
        reason: input.reason,
        points: 0,
        issuedById: input.assignedById,
        issuedByNickname: actorNickname,
        convertedAt: now,
        convertedById: input.assignedById,
        convertedByNickname: actorNickname,
        conversionReason,
        convertedToId: reprimand.id,
      })
      .returning({ id: disciplineTable.id });
    if (!convertedWarning) {
      throw new Error("Не удалось сохранить конвертацию предупреждения за норматив.");
    }

    await writeAudit(tx, {
      actorId: input.assignedById,
      actorNickname,
      category: "discipline",
      action: "discipline.warning_converted",
      entityType: "discipline",
      entityId: reprimand.id,
      entityLabel: "Выговор за норматив для " + member.nickname,
      targetMemberId: member.id,
      targetMemberNickname: member.nickname,
      reason: input.reason,
      details: {
        automatic: true,
        source: "standard_failure",
        assignmentId: input.assignmentId,
        convertedWarningIds: [...activeWarnings.map((warning) => warning.id), convertedWarning.id],
        reprimandId: reprimand.id,
        activeReprimands: decision.nextActiveReprimands,
      },
    });
    issuedId = reprimand.id;
    issuedType = "reprimand";
  } else {
    const [created] = await tx
      .insert(disciplineTable)
      .values({
        memberId: member.id,
        type: "warning",
        status: "active",
        reason: input.reason,
        points: 0,
        issuedById: input.assignedById,
        issuedByNickname: actorNickname,
        requestKey,
      })
      .returning({ id: disciplineTable.id });
    if (!created) throw new Error("Не удалось создать предупреждение за норматив.");

    await writeAudit(tx, {
      actorId: input.assignedById,
      actorNickname,
      category: "discipline",
      action: "discipline.warning_issued",
      entityType: "discipline",
      entityId: created.id,
      entityLabel: "Предупреждение за норматив для " + member.nickname,
      targetMemberId: member.id,
      targetMemberNickname: member.nickname,
      reason: input.reason,
      details: {
        automatic: true,
        source: "standard_failure",
        assignmentId: input.assignmentId,
        standardTitle: input.standardTitle,
        type: "warning",
        activeWarnings: decision.nextActiveWarnings,
        activeReprimands: decision.nextActiveReprimands,
      },
    });
    issuedId = created.id;
    issuedType = "warning";
  }

  if (decision.maxLevelReached) {
    await tx
      .update(membersTable)
      .set({ disciplineMaxReachedAt: member.disciplineMaxReachedAt ?? now })
      .where(eq(membersTable.id, member.id));
    await writeAudit(tx, {
      actorId: input.assignedById,
      actorNickname,
      category: "discipline",
      action: "discipline.max_level_reached",
      entityType: "member",
      entityId: member.id,
      entityLabel: "Максимальный дисциплинарный уровень: " + member.nickname,
      targetMemberId: member.id,
      targetMemberNickname: member.nickname,
      reason: "Достигнут предел в три активных выговора; автоматическое увольнение не выполняется.",
      details: { activeReprimands: 3, automaticDismissal: false },
    });
  }

  return { kind: "issued", type: issuedType, id: issuedId };
}
