import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { membersTable } from "./members";

export const disciplineTable = pgTable(
  "faction_discipline",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    points: integer("points").notNull().default(0),
    type: text("type").notNull().default("warning"),
    status: text("status").notNull().default("active"),
    requestKey: text("request_key"),
    evidencePath: text("evidence_path"),
    issuedById: uuid("issued_by_id").notNull(),
    issuedByNickname: text("issued_by_nickname").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: uuid("revoked_by_id"),
    revokedByNickname: text("revoked_by_nickname"),
    revocationReason: text("revocation_reason"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    convertedById: uuid("converted_by_id"),
    convertedByNickname: text("converted_by_nickname"),
    conversionReason: text("conversion_reason"),
    convertedToId: uuid("converted_to_id"),
  },
  (table) => [
    index("faction_discipline_member_idx").on(table.memberId),
    index("faction_discipline_member_status_type_idx").on(
      table.memberId,
      table.status,
      table.type,
    ),
    uniqueIndex("faction_discipline_request_key_uq").on(table.requestKey),
    check(
      "faction_discipline_type_check",
      sql`${table.type} in ('warning', 'reprimand')`,
    ),
    check(
      "faction_discipline_status_check",
      sql`${table.status} in ('active', 'revoked', 'converted')`,
    ),
  ],
).enableRLS();
