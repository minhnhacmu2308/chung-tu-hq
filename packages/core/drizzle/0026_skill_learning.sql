CREATE TABLE "skill_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"field_key" text NOT NULL,
	"alias" text NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"supplier" text,
	"document_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_samples" ADD COLUMN "source" text DEFAULT 'UPLOAD' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_samples" ADD COLUMN "supplier" text;--> statement-breakpoint
ALTER TABLE "skill_suggestions" ADD CONSTRAINT "skill_suggestions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_suggestions_uq" ON "skill_suggestions" USING btree ("skill_id","field_key","alias");--> statement-breakpoint
CREATE INDEX "skill_suggestions_org_status_idx" ON "skill_suggestions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "skill_samples_document_idx" ON "skill_samples" USING btree ("org_id","document_id");--> statement-breakpoint
CREATE POLICY "skill_suggestions_rls" ON "skill_suggestions" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));