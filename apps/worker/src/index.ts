import { Queue, Worker, type Job } from "bullmq";
import { buildContainer } from "./container.js";
import { extractDocumentJob } from "./jobs/extract-document.js";
import { healthJob } from "./jobs/health.js";
import { certExpiryJob } from "./jobs/cert-expiry.js";
import { customsPollJob, customsSendJob } from "./jobs/customs.js";
import { RATE_JOB_CRON, recordRateFetchFailure } from "@kb/core/modules/admin";
import { failAgentRun, failHsWork } from "@kb/core/modules/declaration";
import { markDocumentFailed } from "@kb/core/modules/extraction";
import { markOutboxFailed } from "@kb/core/modules/integration";
import { failMailSync } from "@kb/core/modules/mailbox";
import { createLogger } from "@kb/core/shared";
import { emailCampaignJob } from "./jobs/email-campaign.js";
import { exchangeRateJob } from "./jobs/exchange-rate.js";
import { hsAnswerJob, hsPollJob, hsReclassifyJob } from "./jobs/hs.js";
import { mailboxSyncJob } from "./jobs/mailbox-sync.js";
import { runAgentJob } from "./jobs/run-agent.js";
import { skillEvaluateJob, skillSampleReadJob } from "./jobs/skill.js";
import { stuckSweeperJob } from "./jobs/stuck-sweeper.js";
import { perOrgLimit } from "./jobs/_per-org.js";
import { startHealthServer } from "./health-server.js";

const log = createLogger({ name: "worker" });
const c = buildContainer();

/** Trường nhận diện lấy từ payload để mọi dòng log tra được theo org / hồ sơ. */
const jobFields = (job: Job | undefined) => {
  const d = (job?.data ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof d[k] === "string" ? { [k]: d[k] } : {});
  return { jobId: job?.id, attempt: job?.attemptsMade, ...pick("orgId"), ...pick("dossierId"), ...pick("documentId"), ...pick("outboxId"), ...pick("agentRunId") };
};

// Mỗi queue một Worker; handler MỎNG (xem apps/worker/CLAUDE.md).
// Queue gọi AI / HSCodePro: mỗi doanh nghiệp tối đa WORKER_MAX_PER_ORG job cùng lúc (perOrgLimit) để một khách lớn không chiếm hết worker;
// extract-document thêm limiter toàn cục AI_RATE_PER_MINUTE lời gọi/phút (giới hạn của nhà cung cấp AI).
const perOrg = <T>(queue: string, handler: (job: Job) => Promise<T>) => perOrgLimit(c.redis, queue, c.env.WORKER_MAX_PER_ORG, handler);
const workers = [
  new Worker("health", async (job) => healthJob(job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("extract-document", perOrg("extract-document", (job) => extractDocumentJob(c.extraction, job.data)), { connection: c.redis, concurrency: 3, limiter: { max: c.env.AI_RATE_PER_MINUTE, duration: 60_000 } }),
  new Worker("skill-sample-read", perOrg("skill-sample-read", (job) => skillSampleReadJob(c.skill, job.data)), { connection: c.redis, concurrency: 2 }),
  new Worker("skill-evaluate", perOrg("skill-evaluate", (job) => skillEvaluateJob(c.skill, job.data)), { connection: c.redis, concurrency: 1 }),
  new Worker("run-agent", perOrg("run-agent", (job) => runAgentJob(c.declaration, job.data)), { connection: c.redis, concurrency: 2 }),
  new Worker("hs-poll", async (job) => hsPollJob(c.declaration, job.data), { connection: c.redis, concurrency: 4 }),
  new Worker("hs-answer", async (job) => hsAnswerJob(c.declaration, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("hs-reclassify", async (job) => hsReclassifyJob(c.declaration, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("customs-send", async (job) => customsSendJob(c.customs, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("customs-poll", async (job) => customsPollJob(c.customs, job.data), { connection: c.redis, concurrency: 2 }),
  new Worker("cert-expiry", async () => certExpiryJob(c.identity), { connection: c.redis, concurrency: 1 }),
  new Worker("exchange-rate-weekly", async () => exchangeRateJob(c.rates), { connection: c.redis, concurrency: 1 }),
  new Worker("mailbox-sync", async (job) => mailboxSyncJob(c.mailbox, job.data), { connection: c.redis, concurrency: 2 }),
  // Gửi email theo đợt: một đợt một lúc (máy chủ SMTP thường giới hạn số thư / phút).
  new Worker("email-campaign", async (job) => emailCampaignJob(c.email, job.data), { connection: c.redis, concurrency: 1 }),
  new Worker("stuck-sweeper", async () => JSON.stringify(await stuckSweeperJob(c)), { connection: c.redis, concurrency: 1 }),
];

// Lịch hằng ngày 01:00 UTC (08:00 VN) – BullMQ job scheduler; upsert theo id nên khởi động lại không nhân đôi. Lỗi thử lại 3 lần cách 10 phút.
const certQueue = new Queue("cert-expiry", { connection: c.redis });
// Tỷ giá tính thuế: thứ Năm 16:30 UTC (= 23:30 giờ VN, "cuối ngày"); lỗi → thử lại mỗi 30 phút, 16 lần (tới ~07:00 VN thứ Sáu,
// trước khi Vietcombank đổi bảng ngày mới). Hết lượt → ghi FAILED, khu Quản trị báo "Cần chú ý".
const rateQueue = new Queue("exchange-rate-weekly", { connection: c.redis });
// Quét bản ghi kẹt (job mất giữa ghi DB và đẩy job) mỗi 5 phút – xem jobs/stuck-sweeper.ts. Không retry: lần quét sau làm tiếp.
const sweeperQueue = new Queue("stuck-sweeper", { connection: c.redis });
async function registerSchedulers() {
  await sweeperQueue.upsertJobScheduler("stuck-sweeper-5m", { pattern: "*/5 * * * *", tz: "UTC" }, { name: "stuck-sweeper", data: {}, opts: { attempts: 1, removeOnComplete: 20, removeOnFail: 20 } });
  await certQueue.upsertJobScheduler("cert-expiry-daily", { pattern: "0 1 * * *", tz: "UTC" }, { name: "cert-expiry", data: {}, opts: { attempts: 3, backoff: { type: "fixed", delay: 10 * 60_000 }, removeOnComplete: 10, removeOnFail: 10 } });
  await rateQueue.upsertJobScheduler("exchange-rate-weekly", { pattern: RATE_JOB_CRON, tz: "UTC" }, { name: "exchange-rate-weekly", data: {}, opts: { attempts: 16, backoff: { type: "fixed", delay: 30 * 60_000 }, removeOnComplete: 20, removeOnFail: 20 } });
}

/** Hết số lần thử (hoặc lỗi không thử lại): không để chứng từ/outbox/dòng HS/lần chạy agent kẹt – đánh dấu lỗi để người dùng thử lại/gửi lại. */
async function onFinalFailure(queue: string, job: Job, e: Error) {
  const d = job.data as Record<string, string>;
  const reason = e.message.slice(0, 300);
  if (queue === "extract-document" && d["orgId"] && d["dossierId"] && d["documentId"]) await markDocumentFailed(c.extraction, { orgId: d["orgId"], dossierId: d["dossierId"], documentId: d["documentId"], reason });
  else if (queue.startsWith("hs-") && d["orgId"] && d["userId"] && d["dossierId"]) {
    await failHsWork(c.declaration, { orgId: d["orgId"], userId: d["userId"], dossierId: d["dossierId"], ...(d["hsJobId"] ? { hsJobId: d["hsJobId"] } : {}), ...(d["lineItemId"] ? { lineItemId: d["lineItemId"] } : {}), error: reason });
  } else if (queue === "run-agent" && d["orgId"] && d["userId"] && d["dossierId"] && d["agentRunId"]) await failAgentRun(c.declaration, { orgId: d["orgId"], userId: d["userId"], dossierId: d["dossierId"], agentRunId: d["agentRunId"], error: reason });
  else if (queue === "exchange-rate-weekly") await recordRateFetchFailure(c.rates, reason);
  else if (queue === "mailbox-sync" && d["orgId"] && d["connectionId"]) await failMailSync(c.mailbox, { orgId: d["orgId"], connectionId: d["connectionId"] });
  else if (queue === "customs-send" && d["orgId"] && d["outboxId"]) await markOutboxFailed(c.customs, { orgId: d["orgId"], outboxId: d["outboxId"], reason });
}

for (const w of workers) {
  w.on("failed", (job, e) => {
    const final = !!job && (job.attemptsMade >= (job.opts.attempts ?? 1) || e.name === "UnrecoverableError");
    log.error(final ? "job lỗi – hết số lần thử" : "job lỗi – sẽ thử lại", { queue: w.name, ...jobFields(job), err: e });
    if (!final) return;
    onFinalFailure(w.name, job, e).catch((x) => log.error("không đánh dấu được bản ghi sau khi job lỗi", { queue: w.name, ...jobFields(job), err: x }));
  });
  w.on("completed", (job, result) => log.info("job xong", { queue: w.name, ...jobFields(job), result: String(result), durationMs: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined }));
  w.on("error", (e) => log.error("worker lỗi kết nối/khung", { queue: w.name, err: e }));
  w.on("stalled", (jobId) => log.warn("job bị coi là treo (stalled) – sẽ chạy lại", { queue: w.name, jobId }));
}

let shuttingDown = false;
const health = c.env.WORKER_HEALTH_PORT ? startHealthServer({ port: c.env.WORKER_HEALTH_PORT, redis: c.redis, queues: () => workers.map((w) => w.name), isShuttingDown: () => shuttingDown }) : null;

registerSchedulers()
  .then(() => log.info("worker sẵn sàng", { queues: workers.map((w) => w.name), ai: c.env.AI_PROVIDER, hs: c.env.HS_CLASSIFIER, mail: c.env.MAILBOX_PROVIDER }))
  .catch((e) => {
    log.error("không đăng ký được lịch chạy định kỳ", { err: e });
    process.exitCode = 1;
  });

/** Tắt êm: ngừng nhận job, chờ job đang chạy tối đa SHUTDOWN_GRACE_MS rồi thoát (job dở sẽ được BullMQ chạy lại khi hết lock). */
const SHUTDOWN_GRACE_MS = 30_000;
async function shutdown(signal: string, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("đang tắt worker", { signal });
  const forceExit = setTimeout(() => {
    log.warn("quá thời gian chờ job đang chạy – thoát", { graceMs: SHUTDOWN_GRACE_MS });
    process.exit(code || 1);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();
  try {
    health?.close();
    await Promise.all([...workers.map((w) => w.close()), certQueue.close(), rateQueue.close(), sweeperQueue.close()]);
    await c.close();
  } catch (e) {
    log.error("lỗi khi tắt", { err: e });
    code ||= 1;
  }
  process.exit(code);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// Lỗi không bắt được: ghi log rồi tắt để orchestrator khởi động lại tiến trình sạch, thay vì chạy tiếp ở trạng thái không rõ.
process.on("unhandledRejection", (e) => {
  log.error("unhandledRejection", { err: e });
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (e) => {
  log.error("uncaughtException", { err: e });
  void shutdown("uncaughtException", 1);
});
