CREATE TABLE "hys_submission_files" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"document_id" text,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hys_submission_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hys_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"seq" integer NOT NULL,
	"procedure_code" text,
	"customs_office" text,
	"processing_unit" text,
	"phone" text,
	"internal_ref" text,
	"note" text,
	"purpose" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"receipt_no" text,
	"registered_on" date,
	"reject" jsonb,
	"fill" jsonb,
	"sent_by" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hys_submissions_status_chk" CHECK (status in ('DRAFT', 'SENDING', 'ACCEPTED', 'REJECTED', 'SEND_FAILED')),
	CONSTRAINT "hys_submissions_purpose_chk" CHECK (purpose is null or purpose in ('PRE_DECLARATION', 'SUPPLEMENT'))
);
--> statement-breakpoint
ALTER TABLE "hys_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hys_submission_files" ADD CONSTRAINT "hys_submission_files_submission_id_hys_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."hys_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hys_submissions" ADD CONSTRAINT "hys_submissions_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hys_submission_files_org_sub_idx" ON "hys_submission_files" USING btree ("org_id","submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hys_submissions_dossier_seq_uq" ON "hys_submissions" USING btree ("dossier_id","seq");--> statement-breakpoint
CREATE INDEX "hys_submissions_org_dossier_idx" ON "hys_submissions" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE POLICY "hys_submission_files_rls" ON "hys_submission_files" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "hys_submissions_rls" ON "hys_submissions" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));