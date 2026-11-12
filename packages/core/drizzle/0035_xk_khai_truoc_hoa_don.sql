-- ADR 0013 – Xuất khẩu khai trước: nguồn chứng từ (dossiers.document_sources), nhập tay lô hàng (manual_shipments),
-- hóa đơn thương mại cấp số trước khai / phát hành sau thông quan (issued_documents, document_counters, invoice_templates, organizations.invoice_*).
-- Gộp các migration chưa phát hành 0034–0038 cũ sau khi merge origin/main (0034 = billing PAYG).
CREATE TABLE "document_counters" (
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"prefix" text NOT NULL,
	"period" text NOT NULL,
	"last" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_org_id_kind_prefix_period_pk" PRIMARY KEY("org_id","kind","prefix","period")
);
--> statement-breakpoint
ALTER TABLE "document_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"layout" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "issued_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"kind" text NOT NULL,
	"no" text NOT NULL,
	"status" text NOT NULL,
	"snapshot" jsonb,
	"issued_by" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"released_by" text,
	"released_at" timestamp with time zone,
	"template_id" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issued_documents_status_chk" CHECK (status in ('RESERVED', 'ISSUED', 'VOID'))
);
--> statement-breakpoint
ALTER TABLE "issued_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "manual_shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_shipments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "invoice_number_pattern" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "invoice_number_reset" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "invoice_signatory_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "invoice_signatory_title" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "invoice_seller_name" text;--> statement-breakpoint
ALTER TABLE "dossiers" ADD COLUMN "document_sources" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_shipments" ADD CONSTRAINT "manual_shipments_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_templates_org_idx" ON "invoice_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_templates_one_default_uq" ON "invoice_templates" USING btree ("org_id") WHERE is_default;--> statement-breakpoint
CREATE UNIQUE INDEX "issued_documents_org_no_uq" ON "issued_documents" USING btree ("org_id","kind","no");--> statement-breakpoint
CREATE UNIQUE INDEX "issued_documents_one_current_uq" ON "issued_documents" USING btree ("org_id","dossier_id","kind") WHERE status in ('RESERVED', 'ISSUED');--> statement-breakpoint
CREATE INDEX "issued_documents_org_dossier_idx" ON "issued_documents" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_shipments_org_dossier_uq" ON "manual_shipments" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE POLICY "document_counters_rls" ON "document_counters" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "invoice_templates_rls" ON "invoice_templates" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "issued_documents_rls" ON "issued_documents" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "manual_shipments_rls" ON "manual_shipments" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));