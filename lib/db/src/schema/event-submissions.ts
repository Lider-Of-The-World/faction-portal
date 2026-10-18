import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { eventsTable } from "./events";
import { membersTable, uploadsTable } from "./members";

export const eventSubmissionsTable = pgTable(
  "faction_event_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
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
    uniqueIndex("faction_event_submissions_version_uq").on(
      table.eventId,
      table.memberId,
      table.version,
    ),
    index("faction_event_submissions_event_member_idx").on(
      table.eventId,
      table.memberId,
      table.submittedAt,
    ),
    index("faction_event_submissions_status_idx").on(table.status),
  ],
).enableRLS();

export const eventSubmissionFilesTable = pgTable(
  "faction_event_submission_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => eventSubmissionsTable.id, { onDelete: "cascade" }),
    uploadId: uuid("upload_id")
      .notNull()
      .unique()
      .references(() => uploadsTable.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("faction_event_submission_files_submission_idx").on(
      table.submissionId,
    ),
  ],
).enableRLS();

export type EventSubmission = typeof eventSubmissionsTable.$inferSelect;
export type InsertEventSubmission = typeof eventSubmissionsTable.$inferInsert;
