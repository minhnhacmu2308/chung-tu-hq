# apps/worker – BullMQ

- Mỗi queue một file trong `src/jobs/`. Handler MỎNG: parse payload bằng Zod → gọi use case của `@kb/core` → ghi tiến trình.
- Payload job bắt buộc có `orgId` (+ `dossierId`, `idempotencyKey` với job hồ sơ). Queue hiện có: `extract-document`, `skill-sample-read` (AI đọc mẫu → nhãn nháp), `skill-evaluate` (đo độ chính xác skill), `run-agent` (HS → ánh xạ → dựng tờ khai → số hóa; task DONE không chạy lại), `customs-send` (một dòng outbox → gateway; OUT ghi một lần), `customs-poll` (hỏi IEX lặp theo delay tới thông quan).
- Handler phải idempotent: chạy lại không tạo bản ghi trùng (kiểm tra theo `idempotencyKey` trước khi ghi).
- Lỗi tạm thời (429, 5xx, timeout) → throw để BullMQ retry với backoff. Lỗi dữ liệu (file hỏng, PDF có mật khẩu) → đánh dấu chứng từ `FAILED` kèm lý do, KHÔNG retry.
- Giới hạn đồng thời theo org để một khách không chiếm hết worker.
- Ghi tiến trình qua `dossier.reportProgress` để web đẩy SSE.
- Không tự gọi SDK AI ở đây; đi qua use case của module `extraction`.
- Chạy: `pnpm dev:worker` (tsx watch, đọc `.env` gốc). Đăng ký `Worker` cho từng queue trong `src/index.ts`; tên queue lấy từ `QUEUE_NAMES` (`@kb/core/shared`).
- `src/container.ts` là composition root (env, db, redis). Handler trong `src/jobs/<queue>.ts` nhận `job.data` dạng `unknown`, parse Zod trước.
