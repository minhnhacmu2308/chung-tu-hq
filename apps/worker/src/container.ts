import { lockedSheetCount } from "@kb/contracts";
import { loadEnv } from "@kb/core/config";
import { activeQuotaBonus } from "@kb/core/modules/admin";
import { createRateDeps } from "@kb/core/modules/admin/infrastructure";
import { createDb, platformDbUrl } from "@kb/core/db";
import { createAiBudget, createBillingInfrastructure, createServiceUsageMeter, DrizzleUsageRecorder } from "@kb/core/modules/billing/infrastructure";
import { createDossierInfrastructure } from "@kb/core/modules/dossier/infrastructure";
import { createAiProvider, createExtractionInfrastructure } from "@kb/core/modules/extraction/infrastructure";
import { createIdentityInfrastructure, createNotifier } from "@kb/core/modules/identity/infrastructure";
import { createCustomsInfrastructure } from "@kb/core/modules/integration/infrastructure";
import { checkSentSheets, customsEditSheets } from "@kb/core/modules/integration";
import { createDeclarationInfrastructure } from "@kb/core/modules/declaration/infrastructure";
import { createMailboxInfrastructure } from "@kb/core/modules/mailbox/infrastructure";
import { cloneTemplatesForOrg, createSkillResolver } from "@kb/core/modules/skill";
import { createSkillInfrastructure } from "@kb/core/modules/skill/infrastructure";
import { runRules } from "@kb/core/modules/validation";
import { createValidationInfrastructure } from "@kb/core/modules/validation/infrastructure";
import { asOrgId, asUserId, createLogger, dec, systemClock, type JobQueue, type QueueName } from "@kb/core/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

const log = createLogger({ name: "worker" });

/** Composition root của worker: nối hạ tầng vào use case. Cùng cách nối với apps/web/src/container.ts. */
export function buildContainer() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL, { max: 5 });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on("error", (e) => log.error("redis lỗi kết nối", { err: e }));
  const queues = new Map<QueueName, Queue>();
  const queue: JobQueue = {
    async enqueue(name, payload, opts) {
      let q = queues.get(name);
      if (!q) {
        q = new Queue(name, { connection: redis, defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
        queues.set(name, q);
      }
      // BullMQ cấm ':' trong jobId tùy chỉnh (trừ đúng 3 phần – quy ước cũ của repeatable job) → thay bằng '_'.
    await q.add(name, payload, { ...(opts?.jobId ? { jobId: opts.jobId.replace(/:/g, "_") } : {}), ...(opts?.delayMs ? { delay: opts.delayMs } : {}) });
    },
  };
  const identity = createIdentityInfrastructure({ db, redis, env, clock: systemClock });
  const orgPlan = { get: (orgId: string) => identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.orgs.findById(orgId)) };
  const usageRecorder = new DrizzleUsageRecorder(db, dec(String(env.AI_USD_VND_RATE)));
  // Chi phí HSCodePro / Customs Hub (đơn giá từ env, mặc định 0) – nối vào declaration và customs bên dưới.
  const serviceUsage = createServiceUsageMeter(db, env);
  // Mức dùng tháng: số hồ sơ + trang từ module dossier (nối lazy vì dossier tạo sau), chi phí AI từ usage_events.
  const monthRange = (now: Date) => ({ from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) });
  let dossierStats: (orgId: string, now: Date) => Promise<{ dossiers: number; pages: number }> = async () => ({ dossiers: 0, pages: 0 });
  const billing = createBillingInfrastructure({
    db, orgPlan, clock: systemClock,
    usage: {
      thisMonth: async (orgId, now) => {
        const { aiCostVnd, hsCostVnd, customsCostVnd } = await usageRecorder.monthlyTotals(orgId, now);
        return { ...(await dossierStats(orgId, now)), aiCostVnd, hsCostVnd, customsCostVnd };
      },
    },
  });
  const quota = {
    check: async (orgId: string, kind: "DOSSIER" | "PAGES", amount: number) => {
      const op = await orgPlan.get(orgId);
      const plan = op ? await billing.plans.get(op.planCode) : null;
      if (!plan) return false;
      if (kind === "PAGES") return amount <= plan.pagesPerDossier;
      const now = systemClock.now();
      // Hạn mức nới thêm của đội vận hành chỉ có hiệu lực đúng tháng đã nới.
      return (await dossierStats(orgId, now)).dossiers + amount <= plan.dossiersPerMonth + activeQuotaBonus({ quotaBonus: op?.quotaBonus ?? 0, quotaBonusMonth: op?.quotaBonusMonth ?? null }, now);
    },
  };
  const dossier = createDossierInfrastructure({ db, redis, env, queue, quota, clock: systemClock });
  dossierStats = (orgId, now) => {
    const { from, to } = monthRange(now);
    return dossier.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.dossiers.statsInRange(orgId, from, to));
  };
  identity.usage = async (orgId) => {
    const u = await billing.usage.thisMonth(orgId, systemClock.now());
    return { dossiersThisMonth: u.dossiers, pagesThisMonth: u.pages, aiCostVnd: u.aiCostVnd, hsCostVnd: u.hsCostVnd, customsCostVnd: u.customsCostVnd };
  };
  const notify = createNotifier({ uow: identity.uow, clock: systemClock, dossierOwner: async (orgId, dossierId) => (await dossier.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.dossiers.get(orgId, dossierId)))?.ownerId ?? null });
  // Luật đối chiếu cần biết hồ sơ nhập/xuất + phương thức vận chuyển: nối từ module dossier tại đây (validation không import dossier).
  const validation = createValidationInfrastructure({
    db,
    dossiers: {
      profile: async (orgId, dossierId) => {
        const d = await dossier.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.dossiers.get(orgId, dossierId));
        return d ? { direction: d.direction, typeCode: d.typeCode, transportMode: d.transportMode } : null;
      },
    },
  });
  const usage = usageRecorder;
  // Skill trước extraction: extraction cần SkillResolver (gợi ý trường theo skill của org).
  const skillBase = createSkillInfrastructure({
    db, queue, storage: dossier.storage, pdf: dossier.pdf, ai: createAiProvider(env), usage,
    users: { names: async (orgId, ids) => new Map((await identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.users.findByIds(ids))).map((u) => [u.id, u.name])) },
    clock: systemClock,
  });
  const extraction = createExtractionInfrastructure({
    db, env, dossier,
    orgInfo: async (orgId) => {
      const o = await identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.orgs.findById(orgId));
      return { taxCode: o?.taxCode ?? "", name: o?.name ?? "", suspectThreshold: (o?.suspectThreshold as "STRICT" | "BALANCED" | "RELAXED") ?? "BALANCED" };
    },
    validation: { run: (orgId, dossierId, shipment, version, org) => runRules(validation, orgId, dossierId, shipment, version, org) },
    usage, ai: skillBase.ai, skills: createSkillResolver(skillBase),
  });
  extraction.notify = notify;
  // Trần chi phí AI/ngày theo doanh nghiệp (AI_DAILY_COST_CAP_VND; 0 = không giới hạn).
  extraction.aiBudget = createAiBudget({ capVnd: env.AI_DAILY_COST_CAP_VND, spentToday: (orgId, now) => usageRecorder.dailyAiCostVnd(orgId, now), clock: systemClock });
  const skill = skillBase;
  identity.onOrgCreated = async (o) => void (await cloneTemplatesForOrg(skill, o));
  const declaration = createDeclarationInfrastructure({
    db, env, queue, dossier, extraction, validation,
    org: {
      get: async (orgId) => {
        const o = await identity.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.orgs.findById(orgId));
        return { taxCode: o?.taxCode ?? "", name: o?.name ?? "", address: o?.address ?? "", phone: o?.phone ?? "", postalCode: o?.postalCode ?? "", fourEyes: o?.fourEyes ?? false };
      },
    },
    users: skillBase.users,
  });
  declaration.notify = notify;
  declaration.usage = serviceUsage;
  // Chi phí người khai nhập ở bước OCR (module declaration) → luật đối chiếu đọc được (R-INCOTERM-FREIGHT); lưu xong chạy lại luật.
  validation.charges = async (orgId, dossierId) => (await declaration.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.valueCharges.get(orgId, dossierId)))?.data ?? null;
  declaration.onChargesSaved = async (orgId, dossierId) => {
    const s = await extraction.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.shipments.latest(orgId, dossierId));
    if (!s) return;
    const o = await extraction.documents.orgInfo(orgId);
    await runRules(validation, orgId, dossierId, s.data, s.version, { taxCode: o.taxCode, name: o.name });
  };
  const customs = createCustomsInfrastructure({ db, env, queue, declaration, dossier, validation, identity });
  // Luật R-BRANCH-COUNT-LOCKED: số tờ đã khai (đã lập kết quả các tờ) khi đã có tờ được cấp số – chuỗi dừng giữa chừng vẫn đủ N tờ.
  validation.branches = async (orgId, dossierId) => lockedSheetCount(await customs.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.results.listForDossier(orgId, dossierId)));
  customs.notify = notify;
  customs.usage = serviceUsage;
  // Duyệt tờ khai lô nhiều tờ: tờ chưa gọi về phải giữ đúng nội dung đã gửi Hải quan (SENT_SHEETS_CHANGED).
  declaration.sentSheetsGuard = (orgId, dossierId) => checkSentSheets(customs, orgId, dossierId);
  // Phạm vi sửa theo giai đoạn truyền và tờ đã gọi về (chưa khai / sửa đổi bổ sung / đã thông quan; lô nhiều tờ chỉ gọi về một phần → khóa chỉ tiêu chung).
  const customsSheets = (orgId: string, dossierId: string) => customsEditSheets(customs, orgId, dossierId);
  declaration.customsSheets = customsSheets;
  extraction.customsSheets = customsSheets;
  dossier.customsSheets = customsSheets;
  // Hộp thư chứng từ: lấy thư Gmail / Outlook, file lưu cùng kho chứng từ.
  const mailbox = createMailboxInfrastructure({ db, env, queue, dossier, identity, clock: systemClock });
  // Nhật ký hoạt động doanh nghiệp (org_audit) – một writer của identity dùng chung cho mọi module.
  mailbox.audit = identity.audit;
  dossier.audit = identity.audit;
  declaration.orgAudit = identity.audit;
  customs.orgAudit = identity.audit;
  skill.audit = identity.audit;
  // Tỷ giá tính thuế: bảng nền tảng, ghi bằng role kb_platform (ADR 0006).
  const rates = createRateDeps(platformDbUrl(env));
  return {
    env, db, redis, queue, identity, billing, dossier, validation, extraction, skill, declaration, customs, mailbox, rates,
    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()));
      await rates.db.close();
      await db.close();
      redis.disconnect();
    },
  };
}
export type Container = ReturnType<typeof buildContainer>;
