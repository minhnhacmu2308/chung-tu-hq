ALTER TABLE "notifications" ADD COLUMN "category" text DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
-- Backfill theo đúng luật notificationCategory (@kb/contracts): thông báo hệ thống → SYSTEM; bước Truyền của hồ sơ → CUSTOMS; hồ sơ khác → DOSSIER; còn lại giữ OTHER.
UPDATE "notifications" SET "category" = CASE
  WHEN "announcement_id" IS NOT NULL THEN 'SYSTEM'
  WHEN "href" LIKE '/dossiers/%' AND "href" ~ '[?&]step=submit(&|#|$)' THEN 'CUSTOMS'
  WHEN "href" LIKE '/dossiers/%' THEN 'DOSSIER'
  ELSE 'OTHER'
END;
