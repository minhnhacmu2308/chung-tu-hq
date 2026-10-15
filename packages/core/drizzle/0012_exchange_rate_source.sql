CREATE TABLE "exchange_rate_fetches" (
	"id" text PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"effective_from" date NOT NULL,
	"status" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"board_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_fetches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exchange_rates" ALTER COLUMN "source" SET DEFAULT 'SEED';--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "snapshot_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "note" text;--> statement-breakpoint
-- Dữ liệu cũ → SEED: trước migration này chưa có màn nhập tay nào (seed ghi source=SEED; MANUAL chỉ là default cột) nên mọi dòng MANUAL đều là dữ liệu mẫu. MANUAL từ nay chỉ dành cho tỷ giá đội vận hành nhập.
UPDATE "exchange_rates" SET "source" = 'SEED' WHERE "source" = 'MANUAL' AND "updated_by" IS NULL;
