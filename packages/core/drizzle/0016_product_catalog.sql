-- Danh mục hàng hóa của doanh nghiệp (mặt hàng đã khai: import bảng kê, thêm tay, tự thêm khi tờ khai được duyệt).
CREATE TABLE "product_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"key" text NOT NULL,
	"name_key" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"hs_code" text NOT NULL,
	"unit" text,
	"origin" text,
	"tariff_schedule" text,
	"import_duty_rate" text,
	"vat_rate" text,
	"note" text,
	"source" text NOT NULL,
	"times_declared" integer DEFAULT 0 NOT NULL,
	"last_declaration_no" text,
	"last_declaration_date" date,
	"last_type_code" text,
	"raw" jsonb,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_catalog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "product_catalog_org_key_uq" ON "product_catalog" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "product_catalog_org_name_idx" ON "product_catalog" USING btree ("org_id","name_key");--> statement-breakpoint
CREATE INDEX "product_catalog_org_hs_idx" ON "product_catalog" USING btree ("org_id","hs_code");--> statement-breakpoint
CREATE POLICY "product_catalog_rls" ON "product_catalog" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));