ALTER TABLE "faction_standards" ADD COLUMN "daily_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "faction_standard_assignments" ADD COLUMN "auto_generated" boolean DEFAULT false NOT NULL;
