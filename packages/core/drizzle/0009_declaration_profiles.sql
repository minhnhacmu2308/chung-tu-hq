CREATE TABLE "declaration_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"direction" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "declaration_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "declaration_profiles_org_direction_uq" ON "declaration_profiles" USING btree ("org_id","direction");--> statement-breakpoint
CREATE POLICY "declaration_profiles_rls" ON "declaration_profiles" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));