-- Số lượng (2) của dòng hàng (spec 2026-11-14 số lượng 2): lưu khi áp kế hoạch danh mục (cùng lúc item_code) / đổi hệ số theo lô – truyền đọc giá trị đã lưu.
-- Chạy lại an toàn (IF NOT EXISTS). Bảng line_items đã có RLS – cột mới theo policy của bảng.
ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "quantity2" numeric(24, 2);--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "quantity2_unit" text;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "quantity2_factor" numeric(24, 9);
