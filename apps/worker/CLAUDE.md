# apps/worker – BullMQ

- Mỗi queue một file trong `src/jobs/`. Handler MỎNG: parse payload bằng Zod → gọi use case của `@kb/core` → ghi tiến trình.
- Payload job bắt buộc có `orgId` (+ `dossierId`, `idempotencyKey` với job hồ sơ). Queue hiện có: `extract-document`, `skill-sample-read` (AI đọc mẫu → nhãn nháp), `skill-evaluate` (đo độ chính xác skill), `run-agent` (HS → ánh xạ → dựng tờ khai → số hóa; task DONE không chạy lại), `customs-send` (một dòng outbox → gateway; OUT ghi một lần), `customs-poll` (hỏi IEX lặp theo delay tới thông quan), `stuck-sweeper` (mỗi 5 phút: gỡ bản ghi kẹt vì job mất – chứng từ QUEUED, outbox chưa gửi, agent treo, hộp thư treo SYNCING; `jobs/stuck-sweeper.ts`).
- Handler phải idempotent: chạy lại không tạo bản ghi trùng (kiểm tra theo `idempotencyKey` trước khi ghi).
- Lỗi tạm thời (429, 5xx, timeout) → throw để BullMQ retry với backoff. Lỗi dữ liệu (file hỏng, PDF có mật khẩu) → đánh dấu chứng từ `FAILED` kèm lý do, KHÔNG retry.
- Giới hạn đồng thời theo org: queue gọi AI/HSCodePro bọc `perOrgLimit` (`src/jobs/_per-org.ts`, semaphore Redis, `WORKER_MAX_PER_ORG`); hết chỗ thì job về hàng trễ vài giây, không tính lần thử lại. `extract-document` có `limiter` `AI_RATE_PER_MINUTE`. Trần chi phí AI/ngày: `AI_DAILY_COST_CAP_VND` (extraction.aiBudget).
- Ghi tiến trình qua `dossier.reportProgress` để web đẩy SSE.
- Không tự gọi SDK AI ở đây; đi qua use case của module `extraction`.
- Chạy: `pnpm dev:worker` (tsx watch, đọc `.env` gốc). Đăng ký `Worker` cho từng queue trong `src/index.ts`; tên queue lấy từ `QUEUE_NAMES` (`@kb/core/shared`).
- `src/container.ts` là composition root (env, db, redis). Handler trong `src/jobs/<queue>.ts` nhận `job.data` dạng `unknown`, parse bằng `parsePayload(schema, raw, queue)` (`src/jobs/_payload.ts`): payload sai → `UnrecoverableError`, BullMQ không thử lại vô ích.
- Log bằng `createLogger({ name: "worker" })` từ `@kb/core/shared` (JSON một dòng, tự che khóa/mật khẩu) – không `console.*`. Kèm `queue`, `jobId`, `orgId`, `dossierId` để tra được.
- Job hết số lần thử → `onFinalFailure` trong `src/index.ts` phải đánh dấu bản ghi liên quan (chứng từ ERROR, outbox FAILED, agent run ERROR…). Thêm queue mới = thêm nhánh ở đó, không để bản ghi kẹt "đang xử lý".
- Tắt êm: SIGTERM → ngừng nhận job, chờ job đang chạy tối đa 30 s rồi thoát; `unhandledRejection`/`uncaughtException` → log rồi thoát để orchestrator khởi động lại.
