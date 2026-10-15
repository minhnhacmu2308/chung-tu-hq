-- Phương thức vận chuyển đủ 7 mã VNACCS (1,2,3,4,5,6,9). "SEA" cũ không phân biệt container → coi là container (mã 2);
-- mapping PTVC đánh dấu nghi ngờ nếu vận đơn không có số container.
ALTER TABLE "dossiers" ALTER COLUMN "transport_mode" SET DEFAULT 'SEA_CONTAINER';--> statement-breakpoint
UPDATE "dossiers" SET "transport_mode" = 'SEA_CONTAINER' WHERE "transport_mode" = 'SEA';
