CREATE TABLE "faction_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "faction_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "faction_login_attempts" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "faction_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" text NOT NULL,
	"nickname_normalized" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"rank" text DEFAULT 'Сотрудник' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"joined_at" date DEFAULT CURRENT_DATE NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login" timestamp with time zone,
	"discipline_max_reached_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "faction_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"object_path" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"actual_size" integer,
	"detected_content_type" text,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verification_message" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faction_uploads_object_path_unique" UNIQUE("object_path")
);
--> statement-breakpoint
CREATE TABLE "faction_event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "faction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'meeting' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text DEFAULT '' NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"prize_pool" integer DEFAULT 0 NOT NULL,
	"participant_limit" integer,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faction_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"event_id" uuid,
	"related_type" text,
	"related_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faction_standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"target" integer NOT NULL,
	"unit" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faction_standard_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"assigned_by_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'not_submitted' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faction_standard_submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	CONSTRAINT "faction_standard_submission_files_upload_id_unique" UNIQUE("upload_id")
);
--> statement-breakpoint
CREATE TABLE "faction_standard_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
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
CREATE TABLE "faction_task_submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	CONSTRAINT "faction_task_submission_files_upload_id_unique" UNIQUE("upload_id")
);
--> statement-breakpoint
CREATE TABLE "faction_task_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
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
CREATE TABLE "faction_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"assignee_id" uuid,
	"status" text DEFAULT 'assigned' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"evidence_path" text,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faction_discipline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"type" text DEFAULT 'warning' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"request_key" text,
	"evidence_path" text,
	"issued_by_id" uuid NOT NULL,
	"issued_by_nickname" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"revoked_by_nickname" text,
	"revocation_reason" text,
	"converted_at" timestamp with time zone,
	"converted_by_id" uuid,
	"converted_by_nickname" text,
	"conversion_reason" text,
	"converted_to_id" uuid,
	CONSTRAINT "faction_discipline_type_check" CHECK ("faction_discipline"."type" in ('warning', 'reprimand')),
	CONSTRAINT "faction_discipline_status_check" CHECK ("faction_discipline"."status" in ('active', 'revoked', 'converted'))
);
--> statement-breakpoint
CREATE TABLE "faction_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_nickname" text NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_label" text NOT NULL,
	"target_member_id" uuid,
	"target_member_nickname" text,
	"reason" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_job_state" (
	"job_name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faction_sessions" ADD CONSTRAINT "faction_sessions_member_id_faction_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."faction_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_uploads" ADD CONSTRAINT "faction_uploads_member_id_faction_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."faction_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_event_registrations" ADD CONSTRAINT "faction_event_registrations_event_id_faction_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."faction_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_event_registrations" ADD CONSTRAINT "faction_event_registrations_member_id_faction_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."faction_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_notifications" ADD CONSTRAINT "faction_notifications_recipient_id_faction_members_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."faction_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_notifications" ADD CONSTRAINT "faction_notifications_event_id_faction_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."faction_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_standard_assignments" ADD CONSTRAINT "faction_standard_assignments_standard_id_faction_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."faction_standards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_standard_assignments" ADD CONSTRAINT "faction_standard_assignments_assignee_id_faction_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."faction_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_standard_assignments" ADD CONSTRAINT "faction_standard_assignments_assigned_by_id_faction_members_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."faction_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_standard_submission_files" ADD CONSTRAINT "faction_standard_submission_files_submission_id_faction_standard_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."faction_standard_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_standard_submission_files" ADD CONSTRAINT "faction_standard_submission_files_upload_id_faction_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."faction_uploads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_standard_submissions" ADD CONSTRAINT "faction_standard_submissions_assignment_id_faction_standard_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."faction_standard_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_standard_submissions" ADD CONSTRAINT "faction_standard_submissions_reviewer_id_faction_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."faction_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_task_submission_files" ADD CONSTRAINT "faction_task_submission_files_submission_id_faction_task_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."faction_task_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_task_submission_files" ADD CONSTRAINT "faction_task_submission_files_upload_id_faction_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."faction_uploads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_task_submissions" ADD CONSTRAINT "faction_task_submissions_task_id_faction_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."faction_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_task_submissions" ADD CONSTRAINT "faction_task_submissions_reviewer_id_faction_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."faction_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_tasks" ADD CONSTRAINT "faction_tasks_assignee_id_faction_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."faction_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_tasks" ADD CONSTRAINT "faction_tasks_cancelled_by_id_faction_members_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."faction_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_discipline" ADD CONSTRAINT "faction_discipline_member_id_faction_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."faction_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faction_sessions_member_idx" ON "faction_sessions" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_members_nickname_normalized_uq" ON "faction_members" USING btree ("nickname_normalized");--> statement-breakpoint
CREATE INDEX "faction_members_status_idx" ON "faction_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faction_members_joined_at_idx" ON "faction_members" USING btree ("joined_at");--> statement-breakpoint
CREATE INDEX "faction_uploads_member_idx" ON "faction_uploads" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_event_registrations_event_member_uq" ON "faction_event_registrations" USING btree ("event_id","member_id");--> statement-breakpoint
CREATE INDEX "faction_event_registrations_event_status_idx" ON "faction_event_registrations" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "faction_events_starts_idx" ON "faction_events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "faction_events_status_idx" ON "faction_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faction_notifications_recipient_created_idx" ON "faction_notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "faction_notifications_recipient_read_idx" ON "faction_notifications" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "faction_notifications_related_idx" ON "faction_notifications" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "faction_standard_assignments_assignee_idx" ON "faction_standard_assignments" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "faction_standard_assignments_status_idx" ON "faction_standard_assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faction_standard_assignments_due_idx" ON "faction_standard_assignments" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "faction_standard_submission_files_submission_idx" ON "faction_standard_submission_files" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_standard_submissions_version_uq" ON "faction_standard_submissions" USING btree ("assignment_id","version");--> statement-breakpoint
CREATE INDEX "faction_standard_submissions_assignment_idx" ON "faction_standard_submissions" USING btree ("assignment_id","submitted_at");--> statement-breakpoint
CREATE INDEX "faction_standard_submissions_status_idx" ON "faction_standard_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faction_task_submission_files_submission_idx" ON "faction_task_submission_files" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_task_submissions_version_uq" ON "faction_task_submissions" USING btree ("task_id","version");--> statement-breakpoint
CREATE INDEX "faction_task_submissions_task_idx" ON "faction_task_submissions" USING btree ("task_id","submitted_at");--> statement-breakpoint
CREATE INDEX "faction_task_submissions_status_idx" ON "faction_task_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faction_tasks_assignee_idx" ON "faction_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "faction_tasks_status_idx" ON "faction_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faction_discipline_member_idx" ON "faction_discipline" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "faction_discipline_member_status_type_idx" ON "faction_discipline" USING btree ("member_id","status","type");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_discipline_request_key_uq" ON "faction_discipline" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "faction_audit_created_idx" ON "faction_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "faction_audit_category_created_idx" ON "faction_audit_logs" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "faction_audit_actor_created_idx" ON "faction_audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "faction_audit_target_created_idx" ON "faction_audit_logs" USING btree ("target_member_id","created_at");