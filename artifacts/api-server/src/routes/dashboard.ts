import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  notInArray,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetDashboardResponse } from "@workspace/api-zod";
import {
  db,
  eventsTable,
  membersTable,
  notificationsTable,
  standardAssignmentsTable,
  taskSubmissionsTable,
  tasksTable,
} from "@workspace/db";
import { requireReadyAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard", requireReadyAuth, async (req, res): Promise<void> => {
  const user = req.factionUser!;
  const employeeOnly = user.role === "employee";
  const now = new Date();

  const [allMembers, activeMembers, upcomingEvents, openTasks, pendingStandards, pendingTaskReviews, overdueStandards, overdueTasks, unreadNotifications] = await Promise.all([
    employeeOnly
      ? Promise.resolve([{ value: 1 }])
      : db.select({ value: count() }).from(membersTable),
    employeeOnly
      ? Promise.resolve([{ value: 1 }])
      : db
          .select({ value: count() })
          .from(membersTable)
          .where(eq(membersTable.status, "active")),
    db
      .select({ value: count() })
      .from(eventsTable)
      .where(
        and(eq(eventsTable.status, "planned"), gte(eventsTable.startsAt, now)),
      ),
    db
      .select({ value: count() })
      .from(tasksTable)
      .where(
        and(
          notInArray(tasksTable.status, ["approved", "cancelled"]),
          employeeOnly ? eq(tasksTable.assigneeId, user.id) : undefined,
        ),
      ),
    db
      .select({ value: count() })
      .from(standardAssignmentsTable)
      .where(
        and(
          eq(standardAssignmentsTable.status, "pending_review"),
          employeeOnly ? eq(standardAssignmentsTable.assigneeId, user.id) : undefined,
        ),
      ),
    db
      .select({ value: count() })
      .from(taskSubmissionsTable)
      .innerJoin(tasksTable, eq(taskSubmissionsTable.taskId, tasksTable.id))
      .where(
        and(
          eq(taskSubmissionsTable.status, "pending_review"),
          employeeOnly ? eq(tasksTable.assigneeId, user.id) : undefined,
        ),
      ),
    db
      .select({ value: count() })
      .from(standardAssignmentsTable)
      .where(
        and(
          eq(standardAssignmentsTable.status, "not_submitted"),
          lt(standardAssignmentsTable.dueAt, now),
          employeeOnly ? eq(standardAssignmentsTable.assigneeId, user.id) : undefined,
        ),
      ),
    db
      .select({ value: count() })
      .from(tasksTable)
      .where(
        and(
          inArray(tasksTable.status, ["assigned", "in_progress"]),
          lt(tasksTable.dueAt, now),
          employeeOnly ? eq(tasksTable.assigneeId, user.id) : undefined,
        ),
      ),
    db
      .select({ value: count() })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.recipientId, user.id),
          isNull(notificationsTable.readAt),
        ),
      ),
  ]);

  const recentEvents = await db
    .select()
    .from(eventsTable)
    .orderBy(desc(eventsTable.startsAt))
    .limit(5);
  const recentTaskRows = await db
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
    .where(employeeOnly ? eq(tasksTable.assigneeId, user.id) : undefined)
    .orderBy(desc(tasksTable.createdAt))
    .limit(5);
  const recentTaskIds = recentTaskRows.map((task) => task.id);
  const recentTaskVersions =
    recentTaskIds.length === 0
      ? []
      : await db
          .select()
          .from(taskSubmissionsTable)
          .where(inArray(taskSubmissionsTable.taskId, recentTaskIds))
          .orderBy(desc(taskSubmissionsTable.version));
  const versionsByTask = new Map<
    string,
    (typeof recentTaskVersions)[number][]
  >();
  for (const version of recentTaskVersions) {
    const versions = versionsByTask.get(version.taskId) ?? [];
    versions.push(version);
    versionsByTask.set(version.taskId, versions);
  }
  const recentTasks = recentTaskRows.map((task) => {
    const versions = versionsByTask.get(task.id) ?? [];
    const latest = versions[0];
    return {
      ...task,
      status:
        ["assigned", "in_progress"].includes(task.status) &&
        task.dueAt !== null &&
        task.dueAt.getTime() < now.getTime()
          ? "overdue"
          : task.status,
      versionCount: versions.length,
      latestVersion: latest?.version ?? null,
      latestComment: latest?.comment ?? null,
      latestReviewReason: latest?.decisionReason ?? null,
    };
  });

  res.json(
    GetDashboardResponse.parse({
      memberCount: Number(allMembers[0]?.value ?? 0),
      activeMembers: Number(activeMembers[0]?.value ?? 0),
      upcomingEvents: Number(upcomingEvents[0]?.value ?? 0),
      openTasks: Number(openTasks[0]?.value ?? 0),
      pendingStandards: Number(pendingStandards[0]?.value ?? 0),
      pendingTaskReviews: Number(pendingTaskReviews[0]?.value ?? 0),
      overdueAssignments:
        Number(overdueStandards[0]?.value ?? 0) +
        Number(overdueTasks[0]?.value ?? 0),
      unreadNotifications: Number(unreadNotifications[0]?.value ?? 0),
      recentEvents,
      recentTasks,
    }),
  );
});

export default router;
