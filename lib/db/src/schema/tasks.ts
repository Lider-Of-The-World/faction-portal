import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const tasksTable = pgTable(
  "faction_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    reason: text("reason").notNull().default(""),
    assigneeId: uuid("assignee_id").references(() => membersTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("assigned"),
    priority: text("priority").notNull().default("normal"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    evidencePath: text("evidence_path"),
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledById: uuid("cancelled_by_id").references(() => membersTable.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("faction_tasks_assignee_idx").on(table.assigneeId),
    index("faction_tasks_status_idx").on(table.status),
  ],
).enableRLS();
