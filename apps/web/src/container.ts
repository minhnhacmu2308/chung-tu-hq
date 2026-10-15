// Composition root của web: nơi DUY NHẤT nối hạ tầng (DB, Redis, queue) vào use case của @kb/core.
// Route handler chỉ gọi getContainer(); không import drizzle/postgres/bullmq ở nơi khác (depcruise chặn).
import { loadEnv, type Env } from "@kb/core/config";
import { createDb, platformDbUrl, runSeed, type Db } from "@kb/core/db";
import { activeQuotaBonus, type AdminDeps, type FailedJobInfo, type IntegrationProbe, type JobMonitor, type SystemProbe } from "@kb/core/modules/admin";
import { createAdminInfrastructure, platformStaffOf, type DrizzleAdminUow } from "@kb/core/modules/admin/infrastructure";
import type { BillingDeps } from "@kb/core/modules/billing";
import type { DeclarationDeps } from "@kb/core/modules/declaration";
import { createDeclarationInfrastructure } from "@kb/core/modules/declaration/infrastructure";
import type { DossierDeps } from "@kb/core/modules/dossier";
import { createDossierInfrastructure } from "@kb/core/modules/dossier/infrastructure";
import type { ExtractionDeps } from "@kb/core/modules/extraction";
import { createAiProvider, createExtractionInfrastructure } from "@kb/core/modules/extraction/infrastructure";
import { runRules, type ValidationDeps } from "@kb/core/modules/validation";
import { createValidationInfrastructure } from "@kb/core/modules/validation/infrastructure";
import { createBillingInfrastructure, DrizzleUsageRecorder } from "@kb/core/modules/billing/infrastructure";
import { hashToken, provisionStaffAccount, requestPasswordReset, resendVerificationEmail, type IdentityDeps, type SecretStore } from "@kb/core/modules/identity";
import { createIdentityInfrastructure, createNotifier } from "@kb/core/modules/identity/infrastructure";
import type { CustomsDeps, IntegrationDeps } from "@kb/core/modules/integration";
import { cloneTemplatesForOrg, createSkillResolver, type SkillDeps } from "@kb/core/modules/skill";
import { createSkillInfrastructure } from "@kb/core/modules/skill/infrastructure";
import { createCustomsInfrastructure, createIntegrationInfrastructure, createVnaccsCredentialsReader, envVnaccsCredentials } from "@kb/core/modules/integration/infrastructure";
import { asOrgId, asUserId, dec, QUEUE_NAMES, systemClock, type JobQueue, type QueueName } from "@kb/core/shared";
import { Queue } from "bullmq";
import { sql } from "drizzle-orm";
import { Redis } from "ioredis";

export type Container = {
  env: Env;
  db: Db;
  redis: Redis;
  queue: JobQueue;
  pingDb: () => Promise<void>;
  identity: IdentityDeps;
  secrets: SecretStore;
  integration: IntegrationDeps;
  billing: BillingDeps;
  dossier: DossierDeps;
  validation: ValidationDeps;
  extraction: ExtractionDeps;
  skill: SkillDeps;
  declaration: DeclarationDeps;
  customs: CustomsDeps;
  /** Khu Quản trị hệ thống – kết nối kb_platform riêng (ADR 0006). */
  admin: AdminDeps;
  /** Chỉ dev/test: nạp lại dữ liệu mẫu. */
  resetDemo: () => Promise<void>;
};

class BullMqJobQueue implements JobQueue {
  private queues = new Map<QueueName, Queue>();
  constructor(private redis: Redis) {}
  async enqueue(name: QueueName, payload: unknown, opts?: { jobId?: string; delayMs?: number }) {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.redis,
        defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
      });
      this.queues.set(name, q);
    }
    // BullMQ cấm ':' trong jobId tùy chỉnh (trừ đúng 3 phần – quy ước cũ của repeatable job) → thay bằng '_'.
    await q.add(name, payload, { ...(opts?.jobId ? { jobId: opts.jobId.replace(/:/g, "_") } : {}), ...(opts?.delayMs ? { delay: opts.delayMs } : {}) });
  }
}

/** Hàng đợi cho khu Quản trị: chỉ số đếm, job lỗi (id, orgId, lỗi) và chạy lại – không trả payload. */
class BullMqJobMonitor implements JobMonitor {
  private queues = new Map<string, Queue>();
  constructor(private redis: Redis) {}
  private q(name: string) {
    let q = this.queues.get(name);
    if (!q) this.queues.set(name, (q = new Queue(name, { connection: this.redis })));
    return q;
  }
  async stats() {
    const startOfDay = new Date();
    startOfDay.setUTCHours(-7, 0, 0, 0); // 00:00 giờ VN
    if (startOfDay.getTime() > Date.now()) startOfDay.setUTCDate(startOfDay.getUTCDate() - 1);
    return Promise.all(
      QUEUE_NAMES.map(async (name) => {
        const q = this.q(name);
        const c = await q.getJobCounts("waiting", "delayed", "active", "failed");
        const done = await q.getCompleted(0, 999);
        return { queue: name, waiting: (c.waiting ?? 0) + (c.delayed ?? 0), active: c.active ?? 0, failed: c.failed ?? 0, completedToday: done.filter((j) => (j.finishedOn ?? 0) >= startOfDay.getTime()).length };
      }),
    );
  }
  async failed(limit: number) {
    const all: FailedJobInfo[] = [];
    for (const name of QUEUE_NAMES) {
      for (const j of await this.q(name).getFailed(0, limit - 1)) {
        const orgId = (j.data as { orgId?: unknown } | undefined)?.orgId;
        all.push({ id: String(j.id), queue: name, orgId: typeof orgId === "string" ? orgId : null, error: j.failedReason ?? null, attempts: j.attemptsMade, failedAt: new Date(j.finishedOn ?? j.timestamp) });
      }
    }
    return all.sort((a, b) => b.failedAt.getTime() - a.failedAt.getTime()).slice(0, limit);
  }
  async retry(queue: string, jobId: string) {
    if (!(QUEUE_NAMES as readonly string[]).includes(queue)) return false;
    const job = await this.q(queue).getJob(jobId);
    if (!job || !(await job.isFailed())) return false;
    await job.retry();
    return true;
  }
  async workerCount() {
    return (await this.q("extract-document").getWorkers()).length;
  }
}

/**
 * Gọi thử tích hợp dùng chung. Hiện chỉ AI (Claude) có API công khai để kiểm khóa; các nhà cung cấp còn lại chưa có đặc tả
 * (docs/BACKEND-TODO.md T1, T2, T4) → báo rõ thay vì giả vờ thành công.
 */
function integrationProbe(env: Env): IntegrationProbe {
  return {
    async test(id, apiKey) {
      if (!apiKey) return { ok: false, detail: "Chưa có khóa API" };
      if (id === "AI_PROVIDER") {
        try {
          const res = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(8000) });
          if (res.ok) return { ok: true, detail: `Gọi thử thành công · hệ thống đang dùng ${env.AI_PROVIDER === "claude" ? "Claude" : "AI giả lập (AI_PROVIDER=fake)"}` };
          return { ok: false, detail: `${res.status} – nhà cung cấp từ chối khóa này` };
        } catch {
          return { ok: false, detail: "Không kết nối được tới nhà cung cấp AI" };
        }
      }
      return { ok: false, detail: "Đã lưu khóa. Chưa gọi thử được: chưa có đặc tả API của nhà cung cấp này (xem docs/BACKEND-TODO.md)" };
    },
  };
}

function build(): Container {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL, { max: 10 });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on("error", (e) => console.error("[redis]", e.message));
  const identity = createIdentityInfrastructure({ db, redis, env, clock: systemClock });
  // Billing/integration lấy dữ liệu org qua uow của identity (không đọc bảng của module khác).
  const orgPlan = { get: (orgId: string) => identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.orgs.findById(orgId)) };
  const defaultCertificate = async (orgId: string) =>
    (await identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.certificates.list(orgId))).find((c) => c.isDefault) ?? null;
  const usageRecorder = new DrizzleUsageRecorder(db, dec(String(env.AI_USD_VND_RATE)));
  // Mức dùng tháng: số hồ sơ + trang từ module dossier (nối lazy vì dossier tạo sau), chi phí AI từ usage_events.
  const monthRange = (now: Date) => ({ from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) });
  let dossierStats: (orgId: string, now: Date) => Promise<{ dossiers: number; pages: number }> = async () => ({ dossiers: 0, pages: 0 });
  const billing = createBillingInfrastructure({
    db, orgPlan, clock: systemClock,
    usage: { thisMonth: async (orgId, now) => ({ ...(await dossierStats(orgId, now)), aiCostVnd: (await usageRecorder.monthlyTotals(orgId, now)).aiCostVnd }) },
  });
  const queue = new BullMqJobQueue(redis);
  // Hạn mức theo gói: hồ sơ/tháng và trang/hồ sơ (billing giữ số; dossier chỉ hỏi được/không).
  const quota = {
    check: async (orgId: string, kind: "DOSSIER" | "PAGES", amount: number) => {
      const op = await orgPlan.get(orgId);
      const plan = op ? await billing.plans.get(op.planCode) : null;
      if (!plan) return false;
      if (kind === "PAGES") return amount <= plan.pagesPerDossier;
      const now = systemClock.now();
      const used = (await dossierStats(orgId, now)).dossiers;
      // Hạn mức nới thêm của đội vận hành chỉ có hiệu lực đúng tháng đã nới.
      return used + amount <= plan.dossiersPerMonth + activeQuotaBonus({ quotaBonus: op?.quotaBonus ?? 0, quotaBonusMonth: op?.quotaBonusMonth ?? null }, now);
    },
  };
  const dossier = createDossierInfrastructure({ db, redis, env, queue, quota, clock: systemClock });
  dossierStats = (orgId, now) => {
    const { from, to } = monthRange(now);
    return dossier.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.dossiers.statsInRange(orgId, from, to));
  };
  identity.usage = async (orgId) => {
    const u = await billing.usage.thisMonth(orgId, systemClock.now());
    return { dossiersThisMonth: u.dossiers, pagesThisMonth: u.pages, aiCostVnd: u.aiCostVnd };
  };
  const notify = createNotifier({ uow: identity.uow, clock: systemClock, dossierOwner: async (orgId, dossierId) => (await dossier.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.dossiers.get(orgId, dossierId)))?.ownerId ?? null });
  const validation = createValidationInfrastructure({ db });
  const usage = usageRecorder;
  const skill = createSkillInfrastructure({
    db, queue, storage: dossier.storage, pdf: dossier.pdf, ai: createAiProvider(env), usage,
    users: { names: async (orgId, ids) => new Map((await identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.users.findByIds(ids))).map((u) => [u.id, u.name])) },
    clock: systemClock,
  });
  // Org mới (đăng ký MST mới) nhận bản sao skill mẫu.
  identity.onOrgCreated = async (o) => void (await cloneTemplatesForOrg(skill, o));
  const extraction = createExtractionInfrastructure({
    db, env, dossier,
    orgInfo: async (orgId: string) => {
      const o = await identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.orgs.findById(orgId));
      return { taxCode: o?.taxCode ?? "", name: o?.name ?? "", suspectThreshold: (o?.suspectThreshold as "STRICT" | "BALANCED" | "RELAXED") ?? "BALANCED" };
    },
    validation: { run: (orgId, dossierId, shipment, version, org) => runRules(validation, orgId, dossierId, shipment, version, org) },
    usage, ai: skill.ai, skills: createSkillResolver(skill),
  });
  extraction.notify = notify;
  const declaration = createDeclarationInfrastructure({
    db, env, queue, dossier, extraction, validation,
    org: {
      get: async (orgId) => {
        const o = await identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.orgs.findById(orgId));
        return { taxCode: o?.taxCode ?? "", name: o?.name ?? "", address: o?.address ?? "", phone: o?.phone ?? "", fourEyes: o?.fourEyes ?? false };
      },
    },
    users: skill.users,
  });
  declaration.notify = notify;
  const customs = createCustomsInfrastructure({ db, env, queue, declaration, dossier, validation, identity });
  customs.notify = notify;
  const jobs = new BullMqJobMonitor(redis);
  const system: SystemProbe = {
    async services(now) {
      const check = async (fn: () => Promise<unknown>) => {
        const t0 = Date.now();
        try {
          await fn();
          return { ok: true, ms: Date.now() - t0 };
        } catch (e) {
          console.error("[admin/system]", (e as Error).message);
          return { ok: false, ms: Date.now() - t0 };
        }
      };
      const at = now.toISOString();
      const [pg, rd, st, workers] = await Promise.all([
        check(() => db.execute(sql`select 1`)),
        check(() => redis.ping()),
        check(async () => {
          await dossier.storage.put("_health/admin-check", Buffer.from("ok"), "text/plain");
          await dossier.storage.delete("_health/admin-check");
        }),
        jobs.workerCount().catch(() => -1),
      ]);
      const svc = (id: "POSTGRES" | "REDIS" | "STORAGE", name: string, r: { ok: boolean; ms: number }) => ({ id, name, status: r.ok ? (r.ms > 1000 ? "DEGRADED" : "UP") : "DOWN", detail: r.ok ? `Phản hồi ${r.ms} ms` : "Không kết nối được", checkedAt: at }) as const;
      return [
        svc("POSTGRES", "Cơ sở dữ liệu", pg),
        svc("REDIS", "Redis (hàng đợi)", rd),
        svc("STORAGE", "Lưu trữ chứng từ", st),
        { id: "WORKER", name: "Worker xử lý nền", status: workers > 0 ? "UP" : "DOWN", detail: workers > 0 ? `${workers} worker đang nghe hàng đợi` : workers === 0 ? "Không có worker nào đang chạy – job sẽ không được xử lý" : "Không đọc được trạng thái worker", checkedAt: at },
      ];
    },
  };
  const admin = createAdminInfrastructure({
    platformUrl: platformDbUrl(env),
    identity: {
      hashToken,
      sendPasswordReset: (email) => requestPasswordReset(identity, email, { ip: "admin" }),
      resendVerification: (userId) => resendVerificationEmail(identity, userId),
      provisionAccount: (input) => provisionStaffAccount(identity, input),
    },
    jobs, system, probe: integrationProbe(env), vault: identity.secrets, limiter: identity.rateLimiter, clock: systemClock,
  });
  // Đăng nhập: tài khoản quản trị viên không thuộc doanh nghiệp vẫn vào được khu /admin.
  identity.platformStaff = (userId) => platformStaffOf(admin.uow as DrizzleAdminUow, userId);
  return {
    env,
    db,
    redis,
    queue,
    pingDb: async () => {
      await db.execute(sql`select 1`);
    },
    identity,
    secrets: identity.secrets,
    integration: createIntegrationInfrastructure({ db, env, clock: systemClock, defaultCertificate, vnaccs: createVnaccsCredentialsReader(identity, envVnaccsCredentials(env)) }),
    billing,
    dossier,
    validation,
    extraction,
    skill,
    declaration,
    customs,
    admin,
    resetDemo: () => runSeed(env.DATABASE_ADMIN_URL),
  };
}

// Next dev tải lại module nhiều lần → giữ một instance trên globalThis để không rò kết nối.
const g = globalThis as unknown as { __kbContainer?: Container };
export function getContainer(): Container {
  if (!g.__kbContainer) g.__kbContainer = build();
  return g.__kbContainer;
}
