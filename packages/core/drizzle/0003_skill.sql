CREATE TABLE "skill_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"version" integer NOT NULL,
	"accuracy" numeric(6, 4) NOT NULL,
	"previous_accuracy" numeric(6, 4),
	"per_field" jsonb NOT NULL,
	"samples" integer NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skill_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"document_id" text,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expected" jsonb,
	"labeled_by" text,
	"labeled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_samples" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"version" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"prompt_notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"doc_kind" text,
	"supplier" text,
	"language" text DEFAULT 'Đa ngôn ngữ' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"template_id" text,
	"current_version" integer DEFAULT 1 NOT NULL,
	"labeled_samples" integer DEFAULT 0 NOT NULL,
	"accuracy" numeric(6, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_evaluations" ADD CONSTRAINT "skill_evaluations_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_samples" ADD CONSTRAINT "skill_samples_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_evaluations_skill_idx" ON "skill_evaluations" USING btree ("skill_id","finished_at");--> statement-breakpoint
CREATE INDEX "skill_samples_skill_idx" ON "skill_samples" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_versions_skill_version_uq" ON "skill_versions" USING btree ("skill_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_org_code_uq" ON "skills" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "skills_org_kind_idx" ON "skills" USING btree ("org_id","kind");--> statement-breakpoint
CREATE POLICY "skill_evaluations_rls" ON "skill_evaluations" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "skill_samples_rls" ON "skill_samples" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "skill_versions_read" ON "skill_versions" AS PERMISSIVE FOR SELECT TO "kb_app" USING (org_id = current_setting('app.org_id', true) OR skill_id IN (select id from skills where is_template = true));--> statement-breakpoint
CREATE POLICY "skill_versions_insert" ON "skill_versions" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "skills_read" ON "skills" AS PERMISSIVE FOR SELECT TO "kb_app" USING (org_id = current_setting('app.org_id', true) OR is_template = true);--> statement-breakpoint
CREATE POLICY "skills_insert" ON "skills" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "skills_update" ON "skills" AS PERMISSIVE FOR UPDATE TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "skills_delete" ON "skills" AS PERMISSIVE FOR DELETE TO "kb_app" USING (org_id = current_setting('app.org_id', true));