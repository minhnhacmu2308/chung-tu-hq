# apps/worker – BullMQ

- Mỗi queue một file trong `src/jobs/`. Handler MỎNG: parse payload bằng Zod → gọi use case của `@kb/core` → ghi tiến trình.
- Payload job bắt buộc có `orgId`, `dossierId`, `idempotencyKey`.
- Handler phải idempotent: chạy lại không tạo bản ghi trùng (kiểm tra theo `idempotencyKey` trước khi ghi).
- Lỗi tạm thời (429, 5xx, timeout) → throw để BullMQ retry với backoff. Lỗi dữ liệu (file hỏng, PDF có mật khẩu) → đánh dấu chứng từ `FAILED` kèm lý do, KHÔNG retry.
- Giới hạn đồng thời theo org để một khách không chiếm hết worker.
- Ghi tiến trình qua `dossier.reportProgress` để web đẩy SSE.
- Không tự gọi SDK AI ở đây; đi qua use case của module `extraction`.
