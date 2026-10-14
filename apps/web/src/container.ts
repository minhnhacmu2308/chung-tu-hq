// Composition root của web: nơi DUY NHẤT nối hạ tầng (DB, Redis, queue) vào use case của @kb/core.
// Route handler chỉ gọi getContainer(); không import drizzle/postgres/bullmq ở nơi khác (depcruise chặn).
import { loadEnv, type Env } from "@kb/core/config";
import { createDb, runSeed, type Db } from "@kb/core/db";
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
import type { IdentityDeps, SecretStore } from "@kb/core/modules/identity";
import { createIdentityInfrastructure, createNotifier } from "@kb/core/modules/identity/infrastructure";
import type { CustomsDeps, IntegrationDeps } from "@kb/core/modules/integration";
import { cloneTemplatesForOrg, createSkillResolver, type SkillDeps } from "@kb/core/modules/skill";
import { createSkillInfrastructure } from "@kb/core/modules/skill/infrastructure";
import { createCustomsInfrastructure, createIntegrationInfrastructure } from "@kb/core/modules/integration/infrastructure";
import { asOrgId, asUserId, dec, systemClock, type JobQueue, type QueueName } from "@kb/core/shared";
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
      const used = (await dossierStats(orgId, systemClock.now())).dossiers;
      return used + amount <= plan.dossiersPerMonth;
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
  // Nguyên tắc 4 mắt: chưa có cấu hình org (BACKEND-TODO N3) → tắt.
  const declaration = createDeclarationInfrastructure({
    db, env, queue, dossier, extraction, validation,
    org: {
      get: async (orgId) => {
        const o = await identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.orgs.findById(orgId));
        return { taxCode: o?.taxCode ?? "", name: o?.name ?? "", address: o?.address ?? "", phone: o?.phone ?? "", fourEyes: false };
      },
    },
    users: skill.users,
  });
  declaration.notify = notify;
  const customs = createCustomsInfrastructure({ db, env, queue, declaration, dossier, validation, identity });
  customs.notify = notify;
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
    integration: createIntegrationInfrastructure({ db, env, clock: systemClock, defaultCertificate }),
    billing,
    dossier,
    validation,
    extraction,
    skill,
    declaration,
    customs,
    resetDemo: () => runSeed(env.DATABASE_ADMIN_URL),
  };
}

// Next dev tải lại module nhiều lần → giữ một instance trên globalThis để không rò kết nối.
const g = globalThis as unknown as { __kbContainer?: Container };
export function getContainer(): Container {
  if (!g.__kbContainer) g.__kbContainer = build();
  return g.__kbContainer;
}
