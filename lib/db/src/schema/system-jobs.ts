import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemJobStateTable = pgTable("system_job_state", {
  jobName: text("job_name").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
}).enableRLS();
