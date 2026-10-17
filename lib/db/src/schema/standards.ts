import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const standardsTable = pgTable("faction_standards", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  requirements: text("requirements").notNull().default(""),
  category: text("category").notNull(),
  target: integer("target").notNull(),
  unit: text("unit").notNull(),
  createdById: uuid("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();
