CREATE TABLE "faction_inactivity_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending_review' NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone,
  "reviewer_id" uuid,
  "reviewer_nickname" text
);
--> statement-breakpoint
ALTER TABLE "faction_inactivity_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "faction_inactivity_requests" ADD CONSTRAINT "faction_inactivity_requests_member_id_faction_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."faction_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_inactivity_requests" ADD CONSTRAINT "faction_inactivity_requests_reviewer_id_faction_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."faction_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faction_inactivity_requests_member_submitted_idx" ON "faction_inactivity_requests" USING btree ("member_id","submitted_at");--> statement-breakpoint
CREATE INDEX "faction_inactivity_requests_status_submitted_idx" ON "faction_inactivity_requests" USING btree ("status","submitted_at");
