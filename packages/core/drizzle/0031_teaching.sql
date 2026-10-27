CREATE TABLE "teach_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"field_code" text NOT NULL,
	"context_key" text NOT NULL,
	"identity" text NOT NULL,
	"context" jsonb NOT NULL,
	"value" text NOT NULL,
	"line" jsonb,
	"hits" integer DEFAULT 1 NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"sample_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_declaration_no" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teach_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teach_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"declaration_no" text,
	"read" jsonb,
	"dossier_id" text,
	"dossier_code" text,
	"comparison" jsonb,
	"matched" integer,
	"total" integer,
	"lessons" integer DEFAULT 0 NOT NULL,
	"error" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teach_samples" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teach_settings" (
	"org_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teach_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "teach_lessons_identity_uq" ON "teach_lessons" USING btree ("org_id","identity");--> statement-breakpoint
CREATE INDEX "teach_lessons_org_status_idx" ON "teach_lessons" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "teach_samples_org_idx" ON "teach_samples" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE POLICY "teach_lessons_rls" ON "teach_lessons" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "teach_samples_rls" ON "teach_samples" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "teach_settings_rls" ON "teach_settings" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));