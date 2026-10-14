CREATE TABLE "document_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"document_id" text NOT NULL,
	"page_no" integer NOT NULL,
	"kind_detected" text,
	"is_duplicate" integer DEFAULT 0 NOT NULL,
	"preview_key" text
);
--> statement-breakpoint
ALTER TABLE "document_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"kind" text DEFAULT 'OTHER' NOT NULL,
	"kind_source" text DEFAULT 'FILENAME' NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"pages" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dossiers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"code" text NOT NULL,
	"direction" text NOT NULL,
	"type_code" text NOT NULL,
	"partner" text NOT NULL,
	"customs_office_code" text NOT NULL,
	"customs_office_name" text DEFAULT '' NOT NULL,
	"skill_set_id" text DEFAULT 'default' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"step" text DEFAULT 'upload' NOT NULL,
	"due_date" date NOT NULL,
	"owner_id" text NOT NULL,
	"note" text,
	"invoice_value" numeric(24, 6) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"incoterm" text DEFAULT '' NOT NULL,
	"transport_mode" text DEFAULT 'SEA' NOT NULL,
	"bill_no" text DEFAULT '' NOT NULL,
	"suspect_fields" integer DEFAULT 0 NOT NULL,
	"declaration_no" text,
	"channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dossiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"job_kind" text NOT NULL,
	"job_id" text NOT NULL,
	"status" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"payload" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "extracted_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"document_id" text NOT NULL,
	"group" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"original_value" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"region" jsonb,
	"note" text,
	"shipment_path" text,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extracted_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"document_id" text NOT NULL,
	"kind" text NOT NULL,
	"skill_version_id" text,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"pipeline_version" text NOT NULL,
	"model" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"raw" jsonb,
	"regions" jsonb,
	"status" text DEFAULT 'DONE' NOT NULL,
	"error" text,
	"usage_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extractions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "field_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"field_id" text,
	"document_id" text,
	"key" text NOT NULL,
	"old_value" text DEFAULT '' NOT NULL,
	"new_value" text DEFAULT '' NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "field_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"version" text NOT NULL,
	"data" jsonb NOT NULL,
	"schema_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "validations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"shipment_version" text NOT NULL,
	"rule_code" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"result" text NOT NULL,
	"severity" text NOT NULL,
	"document_kinds" text[] DEFAULT '{}' NOT NULL,
	"fields" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "validations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text,
	"document_id" text,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(24, 6) DEFAULT '0' NOT NULL,
	"cost_vnd" numeric(24, 6) DEFAULT '0' NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_pages_doc_page_uq" ON "document_pages" USING btree ("document_id","page_no");--> statement-breakpoint
CREATE INDEX "documents_org_dossier_idx" ON "documents" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dossiers_org_code_uq" ON "dossiers" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "dossiers_org_status_idx" ON "dossiers" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "dossiers_org_updated_idx" ON "dossiers" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "job_progress_org_dossier_idx" ON "job_progress" USING btree ("org_id","dossier_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "extracted_fields_doc_key_uq" ON "extracted_fields" USING btree ("document_id","key");--> statement-breakpoint
CREATE INDEX "extracted_fields_org_dossier_idx" ON "extracted_fields" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extractions_idem_uq" ON "extractions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "extractions_org_doc_idx" ON "extractions" USING btree ("org_id","document_id");--> statement-breakpoint
CREATE INDEX "field_audit_org_dossier_idx" ON "field_audit" USING btree ("org_id","dossier_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_dossier_version_uq" ON "shipments" USING btree ("dossier_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "validations_dossier_ver_rule_uq" ON "validations" USING btree ("dossier_id","shipment_version","rule_code");--> statement-breakpoint
CREATE INDEX "validations_org_dossier_idx" ON "validations" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE INDEX "usage_events_org_at_idx" ON "usage_events" USING btree ("org_id","at");--> statement-breakpoint
CREATE POLICY "document_pages_rls" ON "document_pages" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "documents_rls" ON "documents" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "dossiers_rls" ON "dossiers" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "job_progress_rls" ON "job_progress" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "extracted_fields_rls" ON "extracted_fields" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "extractions_rls" ON "extractions" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "field_audit_select" ON "field_audit" AS PERMISSIVE FOR SELECT TO "kb_app" USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "field_audit_insert" ON "field_audit" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "shipments_rls" ON "shipments" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "validations_rls" ON "validations" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "usage_events_rls" ON "usage_events" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));