import { Queue, Worker } from "bullmq";
import { buildContainer } from "./container.js";
import { extractDocumentJob } from "./jobs/extract-document.js";
import { healthJob } from "./jobs/health.js";
import { certExpiryJob } from "./jobs/cert-expiry.js";
import { customsPollJob, customsSendJob } from "./jobs/customs.js";
import { RATE_JOB_CRON, recordRateFetchFailure } from "@kb/core/modules/admin";
import { failHsWork } from "@kb/core/modules/declaration";
import { markDocumentFailed } from "@kb/core/modules/extraction";
import { markOutboxFailed } from "@kb/core/modules/integration";
import { exchangeRateJob } from "./jobs/exchange-rate.js";
import { hsAnswerJob, hsPollJob, hsReclassifyJob } from "./jobs/hs.js";
import { runAgentJob } from "./jobs/run-agent.js";
import { skillEvaluateJob, skillSampleReadJob } from "./jobs/skill.js";

const c = buildContainer();

// Mỗi queue một Worker; handler MỎNG (xem apps/worker/CLAUDE.md). Giới hạn đồng thời theo org: GĐ sau (BACKEND-TODO).
const workers = [
  new Worker("health", async (job) => healthJob(job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("extract-document", async (job) => extractDocumentJob(c.extraction, job.data), { connection: c.redis, concurrency: 3 }),
  new Worker("skill-sample-read", async (job) => skillSampleReadJob(c.skill, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("skill-evaluate", async (job) => skillEvaluateJob(c.skill, job.data), { connection: c.redis, concurrency: 1 }),
  new Worker("run-agent", async (job) => runAgentJob(c.declaration, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("hs-poll", async (job) => hsPollJob(c.declaration, job.data), { connection: c.redis, concurrency: 4 }),
  new Worker("hs-answer", async (job) => hsAnswerJob(c.declaration, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("hs-reclassify", async (job) => hsReclassifyJob(c.declaration, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("customs-send", async (job) => customsSendJob(c.customs, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("customs-poll", async (job) => customsPollJob(c.customs, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("cert-expiry", async () => certExpiryJob(c.identity), { connection: c.redis, concurrency: 1 }),
  new Worker("exchange-rate-weekly", async () => exchangeRateJob(c.rates), { connection: c.redis, concurrency: 1 }),
];
// Lịch hằng ngày 01:00 (UTC) – BullMQ repeatable; thêm lại là idempotent theo jobId.
const certQueue = new Queue("cert-expiry", { connection: c.redis });
void certQueue.upsertJobScheduler("cert-expiry-daily", { pattern: "0 1 * * *" }, { name: "cert-expiry", data: {}, opts: { removeOnComplete: 10, removeOnFail: 10 } });
// Tỷ giá tính thuế: thứ Năm 16:30 UTC (= 23:30 giờ VN, "cuối ngày"); lỗi → thử lại mỗi 30 phút, 16 lần (tới ~07:00 VN thứ Sáu,
// trước khi Vietcombank đổi bảng ngày mới). Hết lượt → ghi FAILED, khu Quản trị báo "Cần chú ý".
const rateQueue = new Queue("exchange-rate-weekly", { connection: c.redis });
void rateQueue.upsertJobScheduler("exchange-rate-weekly", { pattern: RATE_JOB_CRON, tz: "UTC" }, { name: "exchange-rate-weekly", data: {}, opts: { attempts: 16, backoff: { type: "fixed", delay: 30 * 60_000 }, removeOnComplete: 20, removeOnFail: 20 } });

for (const w of workers) {
  w.on("failed", (job, e) => {
    console.error(`[worker] ${w.name} job ${job?.id} lỗi (lần ${job?.attemptsMade}):`, e.message);
    // Hết số lần thử (hoặc lỗi không thử lại – UnrecoverableError): không để chứng từ/outbox/dòng HS kẹt – đánh dấu lỗi để người dùng thử lại/gửi lại.
    if (!job || (job.attemptsMade < (job.opts.attempts ?? 1) && e.name !== "UnrecoverableError")) return;
    const d = job.data as Record<string, string>;
    const reason = e.message.slice(0, 300);
    if (w.name === "extract-document" && d["orgId"] && d["dossierId"] && d["documentId"]) void markDocumentFailed(c.extraction, { orgId: d["orgId"], dossierId: d["dossierId"], documentId: d["documentId"], reason }).catch((x) => console.error("[worker] markDocumentFailed", x));
    if (w.name.startsWith("hs-") && d["orgId"] && d["userId"] && d["dossierId"]) {
      void failHsWork(c.declaration, { orgId: d["orgId"], userId: d["userId"], dossierId: d["dossierId"], ...(d["hsJobId"] ? { hsJobId: d["hsJobId"] } : {}), ...(d["lineItemId"] ? { lineItemId: d["lineItemId"] } : {}), error: reason }).catch((x) => console.error("[worker] failHsWork", x));
    }
    if (w.name === "exchange-rate-weekly") void recordRateFetchFailure(c.rates, reason).catch((x) => console.error("[worker] recordRateFetchFailure", x));
    if (w.name === "customs-send" && d["orgId"] && d["outboxId"]) void markOutboxFailed(c.customs, { orgId: d["orgId"], outboxId: d["outboxId"], reason }).catch((x) => console.error("[worker] markOutboxFailed", x));
  });
  w.on("completed", (job, result) => console.log(`[worker] ${w.name} job ${job.id} xong: ${String(result)}`));
}
console.log(`[worker] sẵn sàng: ${workers.map((w) => w.name).join(", ")} · AI=${c.env.AI_PROVIDER} · HS=${c.env.HS_CLASSIFIER}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} → đóng`);
  await Promise.all([...workers.map((w) => w.close()), certQueue.close(), rateQueue.close()]);
  await c.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
