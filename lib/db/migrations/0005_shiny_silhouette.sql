UPDATE "faction_standards" SET "daily_enabled" = false WHERE "daily_enabled" = true;--> statement-breakpoint
DROP INDEX "faction_standards_single_daily_uq";--> statement-breakpoint
ALTER TABLE "faction_standards" ADD COLUMN "daily_rank" text;--> statement-breakpoint
ALTER TABLE "faction_standards" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "faction_standards_daily_rank_uq" ON "faction_standards" USING btree ("daily_rank") WHERE "faction_standards"."daily_enabled" = true AND "faction_standards"."daily_rank" IS NOT NULL;