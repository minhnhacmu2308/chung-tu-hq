// Tích hợp dùng chung, sức khỏe hệ thống (hàng đợi, job lỗi), skill mẫu.
import type { AdminReasonInput, FailedJob, IntegrationId, PlatformIntegration, SetTemplatePublishedInput, SkillTemplate, SystemHealth, UpdateIntegrationKeyInput } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { QUEUE_LABELS, sanitizeJobError } from "../domain/sanitize.js";
import { audit, guarded, type StaffActor } from "./_shared.js";
import type { AdminDeps, AdminRepos, PlatformIntegrationRow, TemplateRow } from "./ports.js";

export const PLATFORM_INTEGRATIONS: { id: IntegrationId; name: string; description: string }[] = [
  { id: "AI_PROVIDER", name: "Nhà cung cấp AI (Claude)", description: "Đọc chứng từ scan/ảnh cho mọi doanh nghiệp. Một khóa của bên vận hành, chi phí tính vào gói." },
  { id: "HSCODEPRO", name: "hscodepro", description: "Gợi ý mã HS, biểu thuế, chính sách quản lý chuyên ngành." },
  { id: "CUSTOMS_HUB", name: "Customs Hub (VNACCS)", description: "Truyền tờ khai IDA/IDC/EDA/EDC, gửi hồ sơ HYS, tra trạng thái IEX." },
  { id: "EINVOICE", name: "Tra cứu hóa đơn điện tử", description: "Lấy XML hóa đơn GTGT cước vận chuyển – rẻ và chính xác hơn đọc PDF." },
];

const emptyRow = (id: IntegrationId): PlatformIntegrationRow => ({ id, environment: "SANDBOX", ciphertext: null, keyVersion: 1, keyLast4: null, keyUpdatedAt: null, status: "NOT_CONFIGURED", detail: null, lastCheckedAt: null });

async function integrationRows(r: AdminRepos): Promise<PlatformIntegrationRow[]> {
  const stored = new Map((await r.platformIntegrations.list()).map((x) => [x.id, x]));
  return PLATFORM_INTEGRATIONS.map((p) => stored.get(p.id) ?? emptyRow(p.id));
}

function toIntegration(row: PlatformIntegrationRow, activeOrgs: number): PlatformIntegration {
  const meta = PLATFORM_INTEGRATIONS.find((p) => p.id === row.id)!;
  return {
    id: row.id, name: meta.name, description: meta.description, status: row.status, environment: row.environment,
    ...(row.keyLast4 ? { keyLast4: row.keyLast4 } : {}),
    ...(row.keyUpdatedAt ? { keyUpdatedAt: row.keyUpdatedAt.toISOString() } : {}),
    ...(row.lastCheckedAt ? { lastCheckedAt: row.lastCheckedAt.toISOString() } : {}),
    ...(row.detail ? { detail: row.detail } : {}),
    // Khóa dùng chung phục vụ mọi doanh nghiệp đang hoạt động khi đã cấu hình.
    orgCount: row.status === "NOT_CONFIGURED" ? 0 : activeOrgs,
  };
}

const activeOrgCount = async (r: AdminRepos) => (await r.orgs.list()).filter((o) => o.status === "ACTIVE").length;

export async function listPlatformIntegrations(deps: AdminDeps, actor: StaffActor): Promise<Result<PlatformIntegration[]>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => {
      const n = await activeOrgCount(r);
      return ok((await integrationRows(r)).map((x) => toIntegration(x, n)));
    }),
  );
}

async function probeAndSave(deps: AdminDeps, r: AdminRepos, row: PlatformIntegrationRow, apiKey: string | null): Promise<PlatformIntegrationRow> {
  const now = deps.clock.now();
  const res = await deps.probe.test(row.id, apiKey);
  const next: PlatformIntegrationRow = { ...row, status: res.ok ? "CONNECTED" : "ERROR", detail: res.detail, lastCheckedAt: now };
  await r.platformIntegrations.upsert(next, now);
  return next;
}

export async function testPlatformIntegration(deps: AdminDeps, actor: StaffActor, id: IntegrationId): Promise<Result<PlatformIntegration>> {
  return guarded(actor, "SUPPORT", () =>
    deps.uow.run(async (r) => {
      const row = (await integrationRows(r)).find((x) => x.id === id);
      if (!row) return err(domainError("NOT_FOUND", "Không tìm thấy tích hợp"));
      if (!row.ciphertext) return err(domainError("INTEGRATION_NOT_CONFIGURED", "Chưa có khóa API – cập nhật khóa trước khi kiểm tra"));
      const saved = await probeAndSave(deps, r, row, deps.vault.decrypt(row.ciphertext, row.keyVersion));
      return ok(toIntegration(saved, await activeOrgCount(r)));
    }),
  );
}

/** Lưu khóa mới (mã hóa) rồi gọi thử. Khóa đầy đủ không bao giờ trả về trình duyệt – chỉ 4 ký tự cuối. */
export async function updateIntegrationKey(deps: AdminDeps, actor: StaffActor, id: IntegrationId, input: UpdateIntegrationKeyInput): Promise<Result<PlatformIntegration>> {
  return guarded(actor, "PLATFORM", () =>
    deps.uow.run(async (r) => {
      const row = (await integrationRows(r)).find((x) => x.id === id);
      if (!row) return err(domainError("NOT_FOUND", "Không tìm thấy tích hợp"));
      const sealed = deps.vault.encrypt(input.apiKey);
      const withKey: PlatformIntegrationRow = { ...row, ciphertext: sealed.ciphertext, keyVersion: sealed.keyVersion, keyLast4: input.apiKey.slice(-4), keyUpdatedAt: deps.clock.now() };
      const saved = await probeAndSave(deps, r, withKey, input.apiKey);
      const meta = PLATFORM_INTEGRATIONS.find((p) => p.id === id)!;
      await audit(deps, r, actor, "INTEGRATION_KEY_UPDATED", { type: "INTEGRATION", id, label: meta.name }, input.reason, `Khóa mới kết thúc bằng ${withKey.keyLast4}`);
      return ok(toIntegration(saved, await activeOrgCount(r)));
    }),
  );
}

/** id job lỗi trên API = "<hàng đợi>~<job id>". */
const jobKey = (queue: string, id: string) => `${queue}~${id}`;

export async function getSystemHealth(deps: AdminDeps, actor: StaffActor): Promise<Result<SystemHealth>> {
  return guarded(actor, "VIEW", async () => {
    const now = deps.clock.now();
    const [services, stats, failed] = await Promise.all([deps.system.services(now), deps.jobs.stats(), deps.jobs.failed(50)]);
    const orgNames = new Map((await deps.uow.run((r) => r.orgs.list())).map((o) => [o.id, o.name]));
    return ok({
      services,
      queues: stats.map((s) => ({ id: s.queue, name: QUEUE_LABELS[s.queue] ?? s.queue, waiting: s.waiting, active: s.active, failed: s.failed, completedToday: s.completedToday })),
      failedJobs: failed.map((j): FailedJob => ({
        id: jobKey(j.queue, j.id), queueId: j.queue, queueName: QUEUE_LABELS[j.queue] ?? j.queue, kind: QUEUE_LABELS[j.queue] ?? j.queue,
        orgId: j.orgId ?? "", orgName: j.orgId ? (orgNames.get(j.orgId) ?? "—") : "Hệ thống",
        error: sanitizeJobError(j.error), attempts: Math.max(1, j.attempts), failedAt: j.failedAt.toISOString(),
      })),
    });
  });
}

export async function retryFailedJob(deps: AdminDeps, actor: StaffActor, id: string, input: AdminReasonInput): Promise<Result<FailedJob>> {
  return guarded(actor, "SUPPORT", async () => {
    const [queue, jobId] = id.split("~");
    const job = queue && jobId ? (await deps.jobs.failed(500)).find((j) => j.queue === queue && j.id === jobId) : undefined;
    if (!job || !(await deps.jobs.retry(job.queue, job.id))) return err(domainError("NOT_FOUND", "Không tìm thấy job – có thể đã được chạy lại"));
    return deps.uow.run(async (r) => {
      const org = job.orgId ? await r.orgs.get(job.orgId) : null;
      const label = QUEUE_LABELS[job.queue] ?? job.queue;
      await audit(deps, r, actor, "JOB_RETRIED", { type: "JOB", id, label: `${label} · ${job.id}`, ...(org ? { orgId: org.id, orgName: org.name } : {}) }, input.reason);
      return ok({
        id, queueId: job.queue, queueName: label, kind: label, orgId: job.orgId ?? "", orgName: org?.name ?? "Hệ thống",
        error: sanitizeJobError(job.error), attempts: Math.max(1, job.attempts), failedAt: job.failedAt.toISOString(),
      });
    });
  });
}

const toTemplate = (t: TemplateRow): SkillTemplate => ({
  id: t.id, code: t.code, name: t.name, kind: t.kind as SkillTemplate["kind"], ...(t.docKind ? { docKind: t.docKind as NonNullable<SkillTemplate["docKind"]> } : {}),
  version: t.version, fieldCount: t.fieldCount, published: t.published, orgCount: t.orgCount, updatedAt: t.updatedAt.toISOString(),
});

export async function listSkillTemplates(deps: AdminDeps, actor: StaffActor): Promise<Result<SkillTemplate[]>> {
  return guarded(actor, "VIEW", () => deps.uow.run(async (r) => ok((await r.templates.list()).map(toTemplate))));
}

/** Phát hành / ngừng phát hành: chỉ ảnh hưởng doanh nghiệp đăng ký SAU đó (bản sao đã cấp giữ nguyên). */
export async function setSkillTemplatePublished(deps: AdminDeps, actor: StaffActor, id: string, input: SetTemplatePublishedInput): Promise<Result<SkillTemplate>> {
  return guarded(actor, "PLATFORM", () =>
    deps.uow.run(async (r) => {
      const t = (await r.templates.list()).find((x) => x.id === id);
      if (!t) return err(domainError("NOT_FOUND", "Không tìm thấy skill mẫu"));
      if (t.published === input.published) return err(domainError("CONFLICT", input.published ? "Skill này đã được phát hành" : "Skill này chưa phát hành"));
      const now = deps.clock.now();
      await r.templates.setPublished(id, input.published, now);
      await audit(deps, r, actor, input.published ? "SKILL_TEMPLATE_PUBLISHED" : "SKILL_TEMPLATE_UNPUBLISHED", { type: "SKILL_TEMPLATE", id, label: `${t.code} v${t.version}` }, input.reason);
      return ok(toTemplate({ ...t, published: input.published, updatedAt: now }));
    }),
  );
}
