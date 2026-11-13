CREATE TABLE "catalog_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"code_set_id" text NOT NULL,
	"file_name" text NOT NULL,
	"column_map" jsonb NOT NULL,
	"status" text DEFAULT 'PARSING' NOT NULL,
	"counts" jsonb NOT NULL,
	"errors" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_imports_status_chk" CHECK (status in ('PARSING', 'MATCHING', 'DONE', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "catalog_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"item_no" text NOT NULL,
	"kind" text DEFAULT 'GOODS' NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"hs_code" text,
	"base_unit" text,
	"origin" text,
	"tariff_schedule" text,
	"import_duty_rate" numeric(10, 4),
	"vat_rate" numeric(10, 4),
	"env_tax_rate" numeric(10, 4),
	"excise_rate" numeric(10, 4),
	"safeguard_rate" numeric(10, 4),
	"anti_discrimination_rate" numeric(10, 4),
	"description" text,
	"note" text,
	"times_declared" integer DEFAULT 0 NOT NULL,
	"last_declaration_no" text,
	"last_declaration_date" date,
	"last_type_code" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"merged_into_id" text,
	"source" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_kind_chk" CHECK (kind in ('MATERIAL', 'PRODUCT', 'GOODS', 'SUPPLY')),
	CONSTRAINT "catalog_items_status_chk" CHECK (status in ('ACTIVE', 'MERGED', 'ARCHIVED'))
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_match_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"import_id" text,
	"code_set_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"hs_code" text,
	"level" text NOT NULL,
	"suggested_item_id" text,
	"candidates" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_match_queue_level_chk" CHECK (level in ('SURE', 'MAYBE', 'NONE')),
	CONSTRAINT "catalog_match_queue_status_chk" CHECK (status in ('PENDING', 'DONE', 'SKIPPED'))
);
--> statement-breakpoint
ALTER TABLE "catalog_match_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_settings" (
	"org_id" text PRIMARY KEY NOT NULL,
	"mode" text,
	"item_no_prefix" text DEFAULT 'MH-' NOT NULL,
	"item_no_seq" integer DEFAULT 0 NOT NULL,
	"setup_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_settings_mode_chk" CHECK (mode is null or mode in ('SHARED', 'PER_DEPARTMENT'))
);
--> statement-breakpoint
ALTER TABLE "catalog_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "code_set_owners" (
	"code_set_id" text NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	CONSTRAINT "code_set_owners_code_set_id_user_id_pk" PRIMARY KEY("code_set_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "code_set_owners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "code_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"partner_name" text,
	"partner_key" text,
	"is_primary_display" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_sets_kind_chk" CHECK (kind in ('SHARED', 'ACCOUNTING', 'WAREHOUSE', 'CUSTOMS', 'SUPPLIER', 'CUSTOMER'))
);
--> statement-breakpoint
ALTER TABLE "code_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "item_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"code_set_id" text NOT NULL,
	"code" text NOT NULL,
	"code_key" text NOT NULL,
	"name" text,
	"unit" text,
	"item_id" text NOT NULL,
	"status" text NOT NULL,
	"proposed_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_aliases_status_chk" CHECK (status in ('PROPOSED', 'ACTIVE', 'REJECTED')),
	CONSTRAINT "item_aliases_source_chk" CHECK (source in ('IMPORT', 'DOCUMENT', 'MANUAL', 'MIGRATION', 'LESSON'))
);
--> statement-breakpoint
ALTER TABLE "item_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "item_unit_conversions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"item_id" text NOT NULL,
	"unit" text NOT NULL,
	"factor" numeric(24, 9) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_unit_conversions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "catalog_item_id" text;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "catalog_alias_id" text;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "unit_factor" numeric(24, 9);--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "item_code" text;--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD CONSTRAINT "catalog_imports_code_set_id_code_sets_id_fk" FOREIGN KEY ("code_set_id") REFERENCES "public"."code_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_match_queue" ADD CONSTRAINT "catalog_match_queue_import_id_catalog_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."catalog_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_match_queue" ADD CONSTRAINT "catalog_match_queue_code_set_id_code_sets_id_fk" FOREIGN KEY ("code_set_id") REFERENCES "public"."code_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_set_owners" ADD CONSTRAINT "code_set_owners_code_set_id_code_sets_id_fk" FOREIGN KEY ("code_set_id") REFERENCES "public"."code_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_aliases" ADD CONSTRAINT "item_aliases_code_set_id_code_sets_id_fk" FOREIGN KEY ("code_set_id") REFERENCES "public"."code_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_aliases" ADD CONSTRAINT "item_aliases_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_unit_conversions" ADD CONSTRAINT "item_unit_conversions_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_imports_org_idx" ON "catalog_imports" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_items_org_item_no_uq" ON "catalog_items" USING btree ("org_id","item_no");--> statement-breakpoint
CREATE INDEX "catalog_items_org_name_idx" ON "catalog_items" USING btree ("org_id","name_key");--> statement-breakpoint
CREATE INDEX "catalog_items_org_hs_idx" ON "catalog_items" USING btree ("org_id","hs_code");--> statement-breakpoint
CREATE INDEX "catalog_items_org_merged_idx" ON "catalog_items" USING btree ("org_id","merged_into_id");--> statement-breakpoint
CREATE INDEX "catalog_match_queue_org_status_idx" ON "catalog_match_queue" USING btree ("org_id","status","code_set_id");--> statement-breakpoint
CREATE INDEX "code_set_owners_org_user_idx" ON "code_set_owners" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "code_sets_org_idx" ON "code_sets" USING btree ("org_id","kind");--> statement-breakpoint
CREATE INDEX "code_sets_org_partner_idx" ON "code_sets" USING btree ("org_id","partner_key");--> statement-breakpoint
CREATE UNIQUE INDEX "code_sets_org_primary_uq" ON "code_sets" USING btree ("org_id") WHERE is_primary_display;--> statement-breakpoint
CREATE UNIQUE INDEX "code_sets_org_default_uq" ON "code_sets" USING btree ("org_id") WHERE is_default;--> statement-breakpoint
CREATE UNIQUE INDEX "item_aliases_set_code_active_uq" ON "item_aliases" USING btree ("code_set_id","code_key") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "item_aliases_org_item_idx" ON "item_aliases" USING btree ("org_id","item_id");--> statement-breakpoint
CREATE INDEX "item_aliases_org_code_key_idx" ON "item_aliases" USING btree ("org_id","code_key");--> statement-breakpoint
CREATE UNIQUE INDEX "item_unit_conversions_item_unit_uq" ON "item_unit_conversions" USING btree ("item_id","unit");--> statement-breakpoint
CREATE INDEX "item_unit_conversions_org_idx" ON "item_unit_conversions" USING btree ("org_id","item_id");--> statement-breakpoint
CREATE POLICY "catalog_imports_rls" ON "catalog_imports" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "catalog_items_rls" ON "catalog_items" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "catalog_match_queue_rls" ON "catalog_match_queue" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "catalog_settings_rls" ON "catalog_settings" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "code_set_owners_rls" ON "code_set_owners" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "code_sets_rls" ON "code_sets" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "item_aliases_rls" ON "item_aliases" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "item_unit_conversions_rls" ON "item_unit_conversions" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
-- data-migration: product_catalog -> danh mục hàng hóa (idempotent: ON CONFLICT DO NOTHING, id cũ được giữ). mode NULL = chưa thiết lập (coi như PER_DEPARTMENT).
INSERT INTO "catalog_settings" ("org_id") SELECT DISTINCT "org_id" FROM "product_catalog" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "code_sets" ("id", "org_id", "kind", "name", "is_default") SELECT DISTINCT 'cst_mig_' || "org_id", "org_id", 'CUSTOMS', 'XNK', true FROM "product_catalog" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "catalog_items" ("id", "org_id", "item_no", "kind", "name", "name_key", "hs_code", "base_unit", "origin", "tariff_schedule", "import_duty_rate", "vat_rate", "env_tax_rate", "excise_rate", "safeguard_rate", "anti_discrimination_rate", "description", "note", "times_declared", "last_declaration_no", "last_declaration_date", "last_type_code", "status", "source", "updated_by", "created_at", "updated_at")
SELECT p."id", p."org_id",
  s."item_no_prefix" || CASE WHEN (s."item_no_seq" + row_number() OVER (PARTITION BY p."org_id" ORDER BY p."created_at", p."id")) < 1000000 THEN lpad((s."item_no_seq" + row_number() OVER (PARTITION BY p."org_id" ORDER BY p."created_at", p."id"))::text, 6, '0') ELSE (s."item_no_seq" + row_number() OVER (PARTITION BY p."org_id" ORDER BY p."created_at", p."id"))::text END,
  'GOODS', p."name", p."name_key", NULLIF(p."hs_code", ''), p."unit", p."origin", p."tariff_schedule", p."import_duty_rate", p."vat_rate", p."env_tax_rate", p."excise_rate", p."safeguard_rate", p."anti_discrimination_rate", p."description",
  CASE WHEN p."partner" IS NOT NULL AND p."partner" <> '' THEN COALESCE(NULLIF(p."note", '') || E'\n', '') || 'Đối tác: ' || p."partner" ELSE p."note" END,
  p."times_declared", p."last_declaration_no", p."last_declaration_date", p."last_type_code", 'ACTIVE', 'MIGRATION', p."updated_by", p."created_at", p."updated_at"
FROM "product_catalog" p JOIN "catalog_settings" s ON s."org_id" = p."org_id"
WHERE NOT EXISTS (SELECT 1 FROM "catalog_items" c WHERE c."id" = p."id")
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "catalog_settings" s SET "item_no_seq" = GREATEST(s."item_no_seq", (SELECT count(*) FROM "catalog_items" c WHERE c."org_id" = s."org_id" AND c."source" = 'MIGRATION'));--> statement-breakpoint
-- Lưu ý: code_key tính bằng upper()/regexp trong SQL chỉ khớp itemCodeKey (@kb/contracts) với mã ASCII; mã có chữ Unicode thường/hoa đặc biệt có thể lệch – người duyệt xử lý ở hàng chờ.
-- Hai dòng product_catalog cùng code_key trong một org: dòng đầu (created_at, id) thắng bí danh ACTIVE; dòng còn lại vào hàng chờ ghép (MIGRATION_DUPLICATE_CODE), không mất dấu.
WITH keyed AS (
  SELECT p."id", p."org_id", p."code", p."name", p."unit", p."created_at", upper(regexp_replace(normalize(p."code", NFC), '[\s\-./_]+', '', 'g')) AS ck
  FROM "product_catalog" p
  WHERE p."code" IS NOT NULL AND btrim(p."code") <> '' AND EXISTS (SELECT 1 FROM "catalog_items" c WHERE c."id" = p."id")
), ranked AS (
  SELECT k.*, row_number() OVER (PARTITION BY k."org_id", k.ck ORDER BY k."created_at", k."id") AS rn FROM keyed k WHERE k.ck <> ''
)
INSERT INTO "item_aliases" ("id", "org_id", "code_set_id", "code", "code_key", "name", "unit", "item_id", "status", "decided_at", "source")
SELECT 'ali_mig_' || r."id", r."org_id", 'cst_mig_' || r."org_id", r."code", r.ck, r."name", r."unit", r."id", 'ACTIVE', now(), 'MIGRATION'
FROM ranked r WHERE r.rn = 1
ORDER BY r."created_at", r."id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
WITH keyed AS (
  SELECT p."id", p."org_id", p."code", p."name", p."unit", p."hs_code", upper(regexp_replace(normalize(p."code", NFC), '[\s\-./_]+', '', 'g')) AS ck
  FROM "product_catalog" p
  WHERE p."code" IS NOT NULL AND btrim(p."code") <> '' AND EXISTS (SELECT 1 FROM "catalog_items" c WHERE c."id" = p."id")
)
INSERT INTO "catalog_match_queue" ("id", "org_id", "code_set_id", "code", "name", "unit", "hs_code", "level", "suggested_item_id", "candidates", "reason", "status", "source_ref")
SELECT 'cmq_mig_' || k."id", k."org_id", a."code_set_id", k."code", k."name", k."unit", NULLIF(k."hs_code", ''), 'MAYBE', a."item_id",
  jsonb_build_array(jsonb_build_object('itemId', a."item_id", 'score', 1, 'reason', 'MIGRATION_DUPLICATE_CODE'), jsonb_build_object('itemId', k."id", 'score', 1, 'reason', 'MIGRATION_DUPLICATE_CODE')),
  'MIGRATION_DUPLICATE_CODE', 'PENDING', k."id"
FROM keyed k JOIN "item_aliases" a ON a."code_set_id" = 'cst_mig_' || k."org_id" AND a."code_key" = k.ck AND a."status" = 'ACTIVE' AND a."item_id" <> k."id"
WHERE k.ck <> ''
ON CONFLICT DO NOTHING;
