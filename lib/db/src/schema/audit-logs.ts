import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Append-only application audit events. Actor and target names are snapshots;
 * deliberately no cascading foreign keys are used so the log survives account
 * maintenance and later record changes.
 */
export const auditLogsTable = pgTable(
  "faction_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").notNull(),
    actorNickname: text("actor_nickname").notNull(),
    category: text("category").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    entityLabel: text("entity_label").notNull(),
    targetMemberId: uuid("target_member_id"),
    targetMemberNickname: text("target_member_nickname"),
    reason: text("reason"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("faction_audit_created_idx").on(table.createdAt),
    index("faction_audit_category_created_idx").on(
      table.category,
      table.createdAt,
    ),
    index("faction_audit_actor_created_idx").on(
      table.actorId,
      table.createdAt,
    ),
    index("faction_audit_target_created_idx").on(
      table.targetMemberId,
      table.createdAt,
    ),
  ],
).enableRLS();
