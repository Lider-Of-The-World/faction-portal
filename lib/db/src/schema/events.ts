import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const eventsTable = pgTable(
  "faction_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    type: text("type").notNull().default("meeting"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    location: text("location").notNull().default(""),
    rules: text("rules").notNull().default(""),
    prizePool: integer("prize_pool").notNull().default(0),
    participantLimit: integer("participant_limit"),
    status: text("status").notNull().default("planned"),
    createdById: uuid("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("faction_events_starts_idx").on(table.startsAt),
    index("faction_events_status_idx").on(table.status),
  ],
).enableRLS();

export const eventRegistrationsTable = pgTable(
  "faction_event_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("registered"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("faction_event_registrations_event_member_uq").on(
      table.eventId,
      table.memberId,
    ),
    index("faction_event_registrations_event_status_idx").on(
      table.eventId,
      table.status,
    ),
  ],
).enableRLS();
