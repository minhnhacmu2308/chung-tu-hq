# ADR 0001 – Modular monolith, TypeScript toàn bộ

- Trạng thái: Chấp nhận
- Ngày: 2026-10-12

## Bối cảnh
Dự án cá nhân, đội nhỏ (1–3 người). Cần làm nhanh, chi phí vận hành thấp, người mới vào hiểu được ngay. POC đã viết bằng TypeScript (Zod schema, luật đối chiếu, gọi Claude).

## Quyết định
- Một repo, một ngôn ngữ TypeScript: Next.js (web + API), BullMQ worker, PostgreSQL, Redis, object storage chuẩn S3.
- Object storage: **MinIO trong Docker Compose cho dev/local**, **Cloudflare R2 cho production**. Hai môi trường chỉ khác biến môi trường (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), không khác code.
- Nghiệp vụ trong `packages/core` chia module; ranh giới module ép bằng dependency-cruiser.
- Triển khai Docker Compose trên 1 VPS ở giai đoạn đầu.

## Hệ quả
- (+) Dùng chung kiểu dữ liệu và schema FE/BE; ít hạ tầng; tái dùng code POC.
- (−) OCR tự host (PaddleOCR) và model mở cần Python → khi cần sẽ thêm 1 service Python riêng sau port `OcrProvider`, không viết lại hệ thống.
- (+) R2 ở production: ~$0,015/GB/tháng, egress miễn phí, 10 GB đầu miễn phí (giá 01/10/2026) – khoảng $9/tháng khi đạt ~600 GB (10.000 lô/tháng sau 1 năm). Cloudflare lo độ bền dữ liệu, không phải tự sao lưu ổ đĩa.
- (+) MinIO ở dev: chạy offline, không lẫn dữ liệu thật, không tốn phí.
- (−) Dữ liệu production nằm ở hạ tầng Cloudflare. Khách yêu cầu lưu tại Việt Nam → dùng MinIO/nhà cung cấp trong nước cho khách đó (cùng port `ObjectStorage`) và tự lo sao lưu.
- Quy ước: chỉ dùng tính năng S3 mà cả MinIO và R2 đều hỗ trợ (put/get/delete/list, presigned URL, multipart). Không dùng tính năng riêng của một bên.
- Điều kiện xem lại: worker chiếm tài nguyên ảnh hưởng web, hoặc > ~10.000 lô/tháng.
