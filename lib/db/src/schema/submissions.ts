import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { membersTable, uploadsTable } from "./members";
import { standardAssignmentsTable } from "./standard-assignments";
import { tasksTable } from "./tasks";

export const standardSubmissionsTable = pgTable(
  "faction_standard_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => standardAssignmentsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    comment: text("comment").notNull().default(""),
    status: text("status").notNull().default("pending_review"),
    decisionReason: text("decision_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerId: uuid("reviewer_id").references(() => membersTable.id, {
      onDelete: "set null",
    }),
    reviewerNickname: text("reviewer_nickname"),
  },
  (table) => [
    uniqueIndex("faction_standard_submissions_version_uq").on(
      table.assignmentId,
      table.version,
    ),
    index("faction_standard_submissions_assignment_idx").on(
      table.assignmentId,
      table.submittedAt,
    ),
    index("faction_standard_submissions_status_idx").on(table.status),
  ],
).enableRLS();

export const standardSubmissionFilesTable = pgTable(
  "faction_standard_submission_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => standardSubmissionsTable.id, { onDelete: "cascade" }),
    uploadId: uuid("upload_id")
      .notNull()
      .unique()
      .references(() => uploadsTable.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("faction_standard_submission_files_submission_idx").on(
      table.submissionId,
    ),
  ],
).enableRLS();

export const taskSubmissionsTable = pgTable(
  "faction_task_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    comment: text("comment").notNull().default(""),
    status: text("status").notNull().default("pending_review"),
    decisionReason: text("decision_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerId: uuid("reviewer_id").references(() => membersTable.id, {
      onDelete: "set null",
    }),
    reviewerNickname: text("reviewer_nickname"),
  },
  (table) => [
    uniqueIndex("faction_task_submissions_version_uq").on(
      table.taskId,
      table.version,
    ),
    index("faction_task_submissions_task_idx").on(
      table.taskId,
      table.submittedAt,
    ),
    index("faction_task_submissions_status_idx").on(table.status),
  ],
).enableRLS();

export const taskSubmissionFilesTable = pgTable(
  "faction_task_submission_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => taskSubmissionsTable.id, { onDelete: "cascade" }),
    uploadId: uuid("upload_id")
      .notNull()
      .unique()
      .references(() => uploadsTable.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("faction_task_submission_files_submission_idx").on(
      table.submissionId,
    ),
  ],
).enableRLS();

export const insertStandardSubmissionSchema = z.object({
  assignmentId: z.string().uuid(),
  version: z.number().int().positive(),
  comment: z.string().max(2000),
});
export const insertTaskSubmissionSchema = z.object({
  taskId: z.string().uuid(),
  version: z.number().int().positive(),
  comment: z.string().max(2000),
});

export type StandardSubmission = typeof standardSubmissionsTable.$inferSelect;
export type InsertStandardSubmission =
  typeof standardSubmissionsTable.$inferInsert;
export type TaskSubmission = typeof taskSubmissionsTable.$inferSelect;
export type InsertTaskSubmission = typeof taskSubmissionsTable.$inferInsert;
