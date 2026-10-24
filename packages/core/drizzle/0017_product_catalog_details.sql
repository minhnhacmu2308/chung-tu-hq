-- Danh mục hàng hóa: thêm mô tả, ĐVT SL2, đơn giá + mã tiền và đối tác lần khai gần nhất, thuế suất BVMT/TTĐB/TV/PBDX.
ALTER TABLE "product_catalog" ADD COLUMN "env_tax_rate" text;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD COLUMN "excise_rate" text;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD COLUMN "safeguard_rate" text;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD COLUMN "anti_discrimination_rate" text;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD COLUMN "unit2" text;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD COLUMN "unit_price" text;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD COLUMN "partner" text;