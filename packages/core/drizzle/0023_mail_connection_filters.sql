-- Bộ lọc riêng của từng hộp thư (người gửi, từ khóa, loại file); NULL = mặc định như trước.
ALTER TABLE "mail_connections" ADD COLUMN "filters" jsonb;
