CREATE TABLE "post_amendments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"seq" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"header" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_amendments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "post_amendments_dossier_seq_uq" ON "post_amendments" USING btree ("dossier_id","seq");--> statement-breakpoint
CREATE INDEX "post_amendments_org_dossier_idx" ON "post_amendments" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE POLICY "post_amendments_rls" ON "post_amendments" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));