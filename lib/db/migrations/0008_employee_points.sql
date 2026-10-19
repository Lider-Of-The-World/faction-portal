ALTER TABLE "faction_members" ADD COLUMN "points" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "faction_point_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL,
  "delta" integer NOT NULL,
  "reason" text NOT NULL,
  "source" text NOT NULL,
  "assignment_id" uuid,
  "actor_id" uuid NOT NULL,
  "actor_nickname" text NOT NULL,
  "request_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "faction_point_transactions_delta_check" CHECK ("delta" <> 0),
  CONSTRAINT "faction_point_transactions_source_check" CHECK ("source" in ('standard_approved', 'standard_rejected', 'standard_not_submitted', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "faction_point_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "faction_point_transactions" ADD CONSTRAINT "faction_point_transactions_member_id_faction_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."faction_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_point_transactions" ADD CONSTRAINT "faction_point_transactions_assignment_id_faction_standard_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."faction_standard_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faction_point_transactions_member_created_idx" ON "faction_point_transactions" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "faction_point_transactions_assignment_idx" ON "faction_point_transactions" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_point_transactions_request_key_uq" ON "faction_point_transactions" USING btree ("request_key");