-- Danh mục hàng hóa (ADR 0015, bổ sung 2026-11-14): bộ nguồn gốc (đúng một bộ mỗi doanh nghiệp) + hàng chờ giữ hệ số và thông tin mặt hàng của dòng.
-- Chạy lại an toàn (IF NOT EXISTS; phần chuyển dữ liệu chỉ đặt cờ cho doanh nghiệp chưa có bộ nguồn gốc). Bảng đã có RLS – cột mới theo policy của bảng.
ALTER TABLE "catalog_match_queue" ADD COLUMN IF NOT EXISTS "factor" numeric(24, 9);--> statement-breakpoint
ALTER TABLE "catalog_match_queue" ADD COLUMN IF NOT EXISTS "item_fields" jsonb;--> statement-breakpoint
ALTER TABLE "code_sets" ADD COLUMN IF NOT EXISTS "is_source" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "code_sets_org_source_uq" ON "code_sets" USING btree ("org_id") WHERE is_source;--> statement-breakpoint
-- data-migration: mỗi doanh nghiệp đã có danh mục → bộ SHARED (nếu có), không thì bộ is_default (XNK), không thì bộ nội bộ tạo sớm nhất thành nguồn gốc.
UPDATE "code_sets" AS cs SET "is_source" = true
FROM (
  SELECT DISTINCT ON ("org_id") "id", "org_id"
  FROM "code_sets"
  WHERE "kind" IN ('SHARED', 'ACCOUNTING', 'WAREHOUSE', 'CUSTOMS')
  ORDER BY "org_id", ("kind" = 'SHARED') DESC, "is_default" DESC, "created_at" ASC, "id" ASC
) AS pick
WHERE cs."id" = pick."id"
  AND NOT EXISTS (SELECT 1 FROM "code_sets" AS x WHERE x."org_id" = pick."org_id" AND x."is_source");
