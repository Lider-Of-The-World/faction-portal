import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const membersTable = pgTable(
  "faction_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nickname: text("nickname").notNull(),
    nicknameNormalized: text("nickname_normalized").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("employee"),
    rank: text("rank").notNull().default("Сотрудник"),
    status: text("status").notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    joinedAt: date("joined_at", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_DATE`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLogin: timestamp("last_login", { withTimezone: true }),
  disciplineMaxReachedAt: timestamp("discipline_max_reached_at", {
    withTimezone: true,
  }),
  },
  (table) => [
    uniqueIndex("faction_members_nickname_normalized_uq").on(
      table.nicknameNormalized,
    ),
    index("faction_members_status_idx").on(table.status),
    index("faction_members_joined_at_idx").on(table.joinedAt),
  ],
).enableRLS();

export const authSessionsTable = pgTable(
  "faction_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("faction_sessions_member_idx").on(table.memberId)],
).enableRLS();

export const loginAttemptsTable = pgTable("faction_login_attempts", {
  bucketKey: text("bucket_key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
}).enableRLS();

export const uploadsTable = pgTable(
  "faction_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull().unique(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    actualSize: integer("actual_size"),
    detectedContentType: text("detected_content_type"),
    verificationStatus: text("verification_status").notNull().default("pending"),
    verificationMessage: text("verification_message"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("faction_uploads_member_idx").on(table.memberId)],
).enableRLS();
