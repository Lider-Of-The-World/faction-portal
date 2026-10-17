import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const standardsTable = pgTable("faction_standards", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  requirements: text("requirements").notNull().default(""),
  category: text("category").notNull(),
  target: integer("target").notNull(),
  unit: text("unit").notNull(),
  dailyEnabled: boolean("daily_enabled").notNull().default(false),
  dailyRank: text("daily_rank"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdById: uuid("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("faction_standards_daily_rank_uq")
    .on(table.dailyRank)
    .where(sql`${table.dailyEnabled} = true AND ${table.dailyRank} IS NOT NULL`),
]).enableRLS();
