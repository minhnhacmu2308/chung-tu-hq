-- Danh mục hàng hóa (ADR 0015, bổ sung 2026-11-14 số lượng 2): ĐVT số lượng 2 + tỷ lệ (số ĐVT 2 trong 1 ĐVT gốc) của mặt hàng → Số lượng (2) 1.84/2.73.
-- Chạy lại an toàn (IF NOT EXISTS). Bảng catalog_items đã có RLS (catalog_items_rls) – cột mới theo policy của bảng.
ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "qty2_unit" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "qty2_factor" numeric(24, 9);
