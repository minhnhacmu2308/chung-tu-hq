-- is_duplicate: integer 0/1 → boolean; thuế suất/đơn giá danh mục hàng hóa: text → numeric (giá trị không phải số → NULL thay vì làm migration hỏng).
ALTER TABLE "document_pages" ALTER COLUMN "is_duplicate" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "document_pages" ALTER COLUMN "is_duplicate" SET DATA TYPE boolean USING (is_duplicate <> 0);--> statement-breakpoint
ALTER TABLE "document_pages" ALTER COLUMN "is_duplicate" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "product_catalog" ALTER COLUMN "import_duty_rate" SET DATA TYPE numeric(10, 4) USING (CASE WHEN trim(import_duty_rate) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim(import_duty_rate)::numeric(10, 4) ELSE NULL END);--> statement-breakpoint
ALTER TABLE "product_catalog" ALTER COLUMN "vat_rate" SET DATA TYPE numeric(10, 4) USING (CASE WHEN trim(vat_rate) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim(vat_rate)::numeric(10, 4) ELSE NULL END);--> statement-breakpoint
ALTER TABLE "product_catalog" ALTER COLUMN "env_tax_rate" SET DATA TYPE numeric(10, 4) USING (CASE WHEN trim(env_tax_rate) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim(env_tax_rate)::numeric(10, 4) ELSE NULL END);--> statement-breakpoint
ALTER TABLE "product_catalog" ALTER COLUMN "excise_rate" SET DATA TYPE numeric(10, 4) USING (CASE WHEN trim(excise_rate) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim(excise_rate)::numeric(10, 4) ELSE NULL END);--> statement-breakpoint
ALTER TABLE "product_catalog" ALTER COLUMN "safeguard_rate" SET DATA TYPE numeric(10, 4) USING (CASE WHEN trim(safeguard_rate) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim(safeguard_rate)::numeric(10, 4) ELSE NULL END);--> statement-breakpoint
ALTER TABLE "product_catalog" ALTER COLUMN "anti_discrimination_rate" SET DATA TYPE numeric(10, 4) USING (CASE WHEN trim(anti_discrimination_rate) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim(anti_discrimination_rate)::numeric(10, 4) ELSE NULL END);--> statement-breakpoint
ALTER TABLE "product_catalog" ALTER COLUMN "unit_price" SET DATA TYPE numeric(24, 6) USING (CASE WHEN trim(unit_price) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN trim(unit_price)::numeric(24, 6) ELSE NULL END);--> statement-breakpoint
CREATE UNIQUE INDEX "digital_certificates_org_default_uq" ON "digital_certificates" USING btree ("org_id") WHERE is_default;--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_pending_uq" ON "join_requests" USING btree ("org_id","user_id") WHERE status = 'PENDING';--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_status_chk" CHECK (status in ('PENDING', 'APPROVED', 'REJECTED'));--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_chk" CHECK (role in ('OWNER', 'ADMIN', 'DECLARANT', 'APPROVER', 'VIEWER'));--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_status_chk" CHECK (status in ('ACTIVE', 'INVITED', 'DISABLED'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_chk" CHECK (status in ('ACTIVE', 'SUSPENDED'));--> statement-breakpoint
ALTER TABLE "customs_outbox" ADD CONSTRAINT "customs_outbox_status_chk" CHECK (status in ('PENDING', 'SENT', 'FAILED'));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_status_chk" CHECK (status in ('UPLOADING', 'QUEUED', 'READING', 'DONE', 'ERROR'));--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_status_chk" CHECK (status in ('DRAFT', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'SUBMITTED', 'CLEARED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_step_chk" CHECK (step in ('create', 'upload', 'ocr', 'agent', 'review', 'submit'));--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_direction_chk" CHECK (direction in ('NK', 'XK'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_chk" CHECK (status in ('RUNNING', 'DONE', 'ERROR', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_status_chk" CHECK (status in ('DRAFT', 'APPROVED', 'SUBMITTED'));--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_kind_chk" CHECK (kind in ('IDA', 'EDA'));--> statement-breakpoint
ALTER TABLE "hs_jobs" ADD CONSTRAINT "hs_jobs_status_chk" CHECK (status in ('pending', 'processing', 'need_info', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "mail_connections" ADD CONSTRAINT "mail_connections_status_chk" CHECK (status in ('ACTIVE', 'SYNCING', 'ERROR', 'REAUTH'));--> statement-breakpoint
ALTER TABLE "mail_connections" ADD CONSTRAINT "mail_connections_provider_chk" CHECK (provider in ('GMAIL', 'OUTLOOK'));