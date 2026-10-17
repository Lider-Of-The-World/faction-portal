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
  createdById: uuid("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("faction_standards_single_daily_uq")
    .on(table.dailyEnabled)
    .where(sql`${table.dailyEnabled} = true`),
]).enableRLS();
