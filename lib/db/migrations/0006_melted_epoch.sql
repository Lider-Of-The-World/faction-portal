CREATE TABLE "faction_event_submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	CONSTRAINT "faction_event_submission_files_upload_id_unique" UNIQUE("upload_id")
);
--> statement-breakpoint
ALTER TABLE "faction_event_submission_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "faction_event_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"decision_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" uuid,
	"reviewer_nickname" text
);
--> statement-breakpoint
ALTER TABLE "faction_event_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "faction_event_submission_files" ADD CONSTRAINT "faction_event_submission_files_submission_id_faction_event_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."faction_event_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_event_submission_files" ADD CONSTRAINT "faction_event_submission_files_upload_id_faction_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."faction_uploads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_event_submissions" ADD CONSTRAINT "faction_event_submissions_event_id_faction_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."faction_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_event_submissions" ADD CONSTRAINT "faction_event_submissions_member_id_faction_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."faction_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_event_submissions" ADD CONSTRAINT "faction_event_submissions_reviewer_id_faction_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."faction_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faction_event_submission_files_submission_idx" ON "faction_event_submission_files" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_event_submissions_version_uq" ON "faction_event_submissions" USING btree ("event_id","member_id","version");--> statement-breakpoint
CREATE INDEX "faction_event_submissions_event_member_idx" ON "faction_event_submissions" USING btree ("event_id","member_id","submitted_at");--> statement-breakpoint
CREATE INDEX "faction_event_submissions_status_idx" ON "faction_event_submissions" USING btree ("status");