CREATE UNIQUE INDEX "faction_standards_single_daily_uq" ON "faction_standards" USING btree ("daily_enabled") WHERE "faction_standards"."daily_enabled" = true;
