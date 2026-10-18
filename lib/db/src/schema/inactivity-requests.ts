import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const inactivityRequestsTable = pgTable(
  "faction_inactivity_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending_review"),
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
    index("faction_inactivity_requests_member_submitted_idx").on(
      table.memberId,
      table.submittedAt,
    ),
    index("faction_inactivity_requests_status_submitted_idx").on(
      table.status,
      table.submittedAt,
    ),
  ],
).enableRLS();

export type InactivityRequest = typeof inactivityRequestsTable.$inferSelect;
export type InsertInactivityRequest = typeof inactivityRequestsTable.$inferInsert;
