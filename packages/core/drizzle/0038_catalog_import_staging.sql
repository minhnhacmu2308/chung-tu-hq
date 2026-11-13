ALTER TABLE "catalog_imports" ADD COLUMN "rows" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD COLUMN "rows_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD COLUMN "rows_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_match_queue" ADD COLUMN "import_row" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_match_queue_import_row_uq" ON "catalog_match_queue" USING btree ("import_id","import_row") WHERE import_id is not null and import_row is not null;