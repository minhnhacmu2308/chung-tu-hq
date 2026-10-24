-- Mã bưu chính của doanh nghiệp (6 số theo VNACCS): điền chỉ tiêu 1.14 IDA (TK_IMY) / 2.13 EDA (TK_EPP) thay cho "000000" gửi cứng.
ALTER TABLE "organizations" ADD COLUMN "postal_code" text DEFAULT '' NOT NULL;
