import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";
import { membersTable } from "./members";

export const notificationsTable = pgTable(
  "faction_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => eventsTable.id, {
      onDelete: "set null",
    }),
    relatedType: text("related_type"),
    relatedId: uuid("related_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("faction_notifications_recipient_created_idx").on(
      table.recipientId,
      table.createdAt,
    ),
    index("faction_notifications_recipient_read_idx").on(
      table.recipientId,
      table.readAt,
    ),
    index("faction_notifications_related_idx").on(
      table.relatedType,
      table.relatedId,
    ),
  ],
).enableRLS();
