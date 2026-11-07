-- Gói dịch vụ: Theo lượt (PAYG) + Hợp đồng năm (CONTRACT) – ADR 0011, spec docs/superpowers/specs/2026-11-07-billing-payg-contract-design.md.
-- Thứ tự: bảng mới (sổ lượt, thanh toán) → cột mới của plans/org_contracts → 2 gói mới → chuyển doanh nghiệp theo D6
-- (ENTERPRISE → CONTRACT; TRIAL/BASIC/PRO → PAYG + tặng 3 lượt, khóa grant:migrate:<orgId>) → xóa 4 gói cũ → bỏ cột hạn mức hồ sơ/dùng thử → RLS.
CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"amount_vnd" numeric(24, 6) DEFAULT '0' NOT NULL,
	"unit_price_vnd" numeric(24, 6) DEFAULT '0' NOT NULL,
	"dossier_id" text,
	"branch" integer,
	"declaration_no" text,
	"payment_id" text,
	"note" text,
	"created_by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_reason_chk" CHECK (reason in ('PURCHASE', 'MANUAL_TOPUP', 'GRANT', 'CHARGE', 'CONTRACT_USE', 'REFUND', 'ADJUST'))
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text DEFAULT 'PAYOS' NOT NULL,
	"order_code" bigint NOT NULL,
	"credits" integer NOT NULL,
	"amount_vnd" numeric(24, 6) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"checkout_url" text,
	"payment_link_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"raw" jsonb,
	CONSTRAINT "payments_status_chk" CHECK (status in ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED'))
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "credit_ledger_org_at_idx" ON "credit_ledger" USING btree ("org_id","at");
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_code_uq" ON "payments" USING btree ("order_code");
--> statement-breakpoint
CREATE INDEX "payments_org_created_idx" ON "payments" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","created_at");
--> statement-breakpoint
-- plans.kind: thêm nullable, điền dữ liệu, rồi mới đặt NOT NULL (bảng đã có dòng).
ALTER TABLE "plans" ADD COLUMN "kind" text;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "price_per_declaration_vnd" numeric(24, 6) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "org_contracts" ADD COLUMN "starts_on" date;
--> statement-breakpoint
ALTER TABLE "org_contracts" ADD COLUMN "value_vnd" numeric(24, 6) DEFAULT '0' NOT NULL;
--> statement-breakpoint
-- Hai gói mới (seed chạy sau vẫn idempotent theo code). dossiers_per_month còn NOT NULL tới cuối migration → điền 0.
INSERT INTO "plans" ("code", "name", "kind", "dossiers_per_month", "pages_per_dossier", "price_vnd", "price_per_declaration_vnd")
VALUES ('PAYG', 'Theo lượt', 'PAYG', 0, 40, 0, 25000), ('CONTRACT', 'Hợp đồng năm', 'CONTRACT', 0, 100, 0, 0)
ON CONFLICT ("code") DO UPDATE SET "kind" = excluded."kind", "price_per_declaration_vnd" = excluded."price_per_declaration_vnd";
--> statement-breakpoint
-- D6: doanh nghiệp đang dùng TRIAL/BASIC/PRO chuyển PAYG kèm 3 lượt tặng (ghi trước khi đổi mã gói; khóa chống trùng = id).
-- ENTERPRISE → CONTRACT: dòng 0 lượt ghi mốc chuyển gói – job đối soát chỉ ghi bù tờ khai được chấp nhận SAU mốc đầu tiên của sổ lượt (không tính hồi tố).
INSERT INTO "credit_ledger" ("id", "org_id", "delta", "reason", "amount_vnd", "unit_price_vnd", "note", "created_by")
SELECT 'grant:migrate:' || "id", "id",
  CASE WHEN "plan_code" = 'ENTERPRISE' THEN 0 ELSE 3 END, 'GRANT', 0, 0,
  CASE WHEN "plan_code" = 'ENTERPRISE' THEN 'Chuyển sang gói Hợp đồng năm' ELSE 'Tặng 3 lượt khi chuyển sang gói Theo lượt' END, 'system'
FROM "organizations" WHERE "plan_code" IN ('TRIAL', 'BASIC', 'PRO', 'ENTERPRISE')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- D6: ENTERPRISE → CONTRACT (chưa có ngày hết hạn – quản trị nhập sau); mọi gói cũ còn lại → PAYG.
UPDATE "organizations"
SET "plan_code" = CASE WHEN "plan_code" = 'ENTERPRISE' THEN 'CONTRACT' ELSE 'PAYG' END, "plan_started_at" = now(), "updated_at" = now()
WHERE "plan_code" NOT IN ('PAYG', 'CONTRACT');
--> statement-breakpoint
-- Thông báo đã gửi theo gói cũ: đổi sang mã gói mới để còn đọc được (AnnouncementAudienceSchema).
UPDATE "announcements" SET "audience" = CASE WHEN "audience" = 'ENTERPRISE' THEN 'CONTRACT' ELSE 'PAYG' END
WHERE "audience" IN ('TRIAL', 'BASIC', 'PRO', 'ENTERPRISE');
--> statement-breakpoint
DELETE FROM "plans" WHERE "code" NOT IN ('PAYG', 'CONTRACT');
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "kind" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_kind_chk" CHECK (kind in ('PAYG', 'CONTRACT'));
--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "quota_bonus";
--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "quota_bonus_month";
--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "trial_ends_at";
--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "dossiers_per_month";
--> statement-breakpoint
CREATE POLICY "org_contracts_read" ON "org_contracts" AS PERMISSIVE FOR SELECT TO "kb_app" USING (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
CREATE POLICY "credit_ledger_read" ON "credit_ledger" AS PERMISSIVE FOR SELECT TO "kb_app" USING (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
CREATE POLICY "credit_ledger_insert" ON "credit_ledger" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
CREATE POLICY "payments_rls" ON "payments" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
CREATE POLICY "payments_lookup" ON "payments" AS PERMISSIVE FOR SELECT TO "kb_app" USING (coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = '');
