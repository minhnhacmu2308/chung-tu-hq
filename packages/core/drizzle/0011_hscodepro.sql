CREATE TABLE "hs_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text NOT NULL,
	"polls" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hs_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hs_suggestions" ADD COLUMN "why_not" text;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "hs_job_id" text;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "hs_item_id" text;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "hs_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "hs_question" jsonb;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "hs_error" jsonb;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "hs_detail" jsonb;--> statement-breakpoint
ALTER TABLE "hs_jobs" ADD CONSTRAINT "hs_jobs_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hs_jobs_org_dossier_idx" ON "hs_jobs" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE POLICY "hs_jobs_rls" ON "hs_jobs" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));