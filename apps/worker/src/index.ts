import { Queue, Worker } from "bullmq";
import { buildContainer } from "./container.js";
import { extractDocumentJob } from "./jobs/extract-document.js";
import { healthJob } from "./jobs/health.js";
import { certExpiryJob } from "./jobs/cert-expiry.js";
import { customsPollJob, customsSendJob } from "./jobs/customs.js";
import { markDocumentFailed } from "@kb/core/modules/extraction";
import { markOutboxFailed } from "@kb/core/modules/integration";
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
  new Worker("customs-send", async (job) => customsSendJob(c.customs, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("customs-poll", async (job) => customsPollJob(c.customs, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("cert-expiry", async () => certExpiryJob(c.identity), { connection: c.redis, concurrency: 1 }),
];
// Lịch hằng ngày 01:00 (UTC) – BullMQ repeatable; thêm lại là idempotent theo jobId.
const certQueue = new Queue("cert-expiry", { connection: c.redis });
void certQueue.upsertJobScheduler("cert-expiry-daily", { pattern: "0 1 * * *" }, { name: "cert-expiry", data: {}, opts: { removeOnComplete: 10, removeOnFail: 10 } });

for (const w of workers) {
  w.on("failed", (job, e) => {
    console.error(`[worker] ${w.name} job ${job?.id} lỗi (lần ${job?.attemptsMade}):`, e.message);
    // Hết số lần thử: không để chứng từ/outbox kẹt – đánh dấu lỗi để người dùng thử lại/gửi lại.
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const d = job.data as Record<string, string>;
    const reason = e.message.slice(0, 300);
    if (w.name === "extract-document" && d["orgId"] && d["dossierId"] && d["documentId"]) void markDocumentFailed(c.extraction, { orgId: d["orgId"], dossierId: d["dossierId"], documentId: d["documentId"], reason }).catch((x) => console.error("[worker] markDocumentFailed", x));
    if (w.name === "customs-send" && d["orgId"] && d["outboxId"]) void markOutboxFailed(c.customs, { orgId: d["orgId"], outboxId: d["outboxId"], reason }).catch((x) => console.error("[worker] markOutboxFailed", x));
  });
  w.on("completed", (job, result) => console.log(`[worker] ${w.name} job ${job.id} xong: ${String(result)}`));
}
console.log(`[worker] sẵn sàng: ${workers.map((w) => w.name).join(", ")} · AI=${c.env.AI_PROVIDER}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} → đóng`);
  await Promise.all([...workers.map((w) => w.close()), certQueue.close()]);
  await c.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
