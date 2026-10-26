import type { Integration, IntegrationId } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { INTEGRATIONS, ORG_VISIBLE } from "./_catalog.js";
import type { IntegrationDeps } from "./ports.js";

export async function testIntegration(deps: IntegrationDeps, ctx: Ctx, kind: IntegrationId): Promise<Result<Integration>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  // Dịch vụ nền tảng không phải việc của doanh nghiệp → coi như không có (quản trị kiểm ở khu Quản trị hệ thống).
  const it = ORG_VISIBLE.includes(kind) ? INTEGRATIONS.find((x) => x.id === kind) : undefined;
  const probe = deps.probes[kind];
  if (!it || !probe) return err(domainError("NOT_FOUND", "Không tìm thấy kết nối"));
  if (!probe.configured) return err(domainError("INTEGRATION_NOT_CONFIGURED", "Kết nối chưa được cấu hình – liên hệ quản trị KhaiBáo AI để bật"));
  const now = deps.clock.now();
  const r = await probe.probe(ctx.orgId);
  const row = { id: deps.idGen.next("job"), orgId: ctx.orgId, kind, status: r.ok ? ("CONNECTED" as const) : ("ERROR" as const), detail: r.detail || null, lastCheckedAt: now };
  await deps.statusRepo.upsert(row);
  return ok({ ...it, status: row.status, lastCheckedAt: now.toISOString(), ...(row.detail ? { detail: row.detail } : {}) });
}
