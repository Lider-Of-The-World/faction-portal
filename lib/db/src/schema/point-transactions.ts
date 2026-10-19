import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { membersTable } from "./members";
import { standardAssignmentsTable } from "./standard-assignments";

export const pointTransactionsTable = pgTable(
  "faction_point_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").notNull().references(() => membersTable.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    assignmentId: uuid("assignment_id").references(() => standardAssignmentsTable.id, { onDelete: "restrict" }),
    actorId: uuid("actor_id").notNull(),
    actorNickname: text("actor_nickname").notNull(),
    requestKey: text("request_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("faction_point_transactions_member_created_idx").on(table.memberId, table.createdAt),
    index("faction_point_transactions_assignment_idx").on(table.assignmentId),
    uniqueIndex("faction_point_transactions_request_key_uq").on(table.requestKey),
    check("faction_point_transactions_delta_check", sql`${table.delta} <> 0`),
    check("faction_point_transactions_source_check", sql`${table.source} in ('standard_approved', 'standard_rejected', 'standard_not_submitted', 'manual')`),
  ],
).enableRLS();

export type PointTransaction = typeof pointTransactionsTable.$inferSelect;
export type InsertPointTransaction = typeof pointTransactionsTable.$inferInsert;
