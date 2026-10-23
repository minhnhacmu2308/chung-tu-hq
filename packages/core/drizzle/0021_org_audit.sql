CREATE TABLE "org_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_label" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "org_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "org_audit_org_at_idx" ON "org_audit" USING btree ("org_id","at");--> statement-breakpoint
CREATE POLICY "org_audit_select" ON "org_audit" AS PERMISSIVE FOR SELECT TO "kb_app" USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "org_audit_insert" ON "org_audit" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK (org_id = current_setting('app.org_id', true));