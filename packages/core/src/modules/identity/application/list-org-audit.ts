import type { OrgAuditEntryDto, Page, PageQuery } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { canManageOrg } from "../domain/role-rules.js";
import { ok, type Result } from "../../../shared/result.js";
import type { IdentityDeps } from "./ports.js";

/** Nhật ký hoạt động của doanh nghiệp – Quản trị / Chủ sở hữu, mới nhất trước, phân trang server. */
export async function listOrgAudit(deps: IdentityDeps, ctx: Ctx, page: PageQuery): Promise<Result<Page<OrgAuditEntryDto>>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  const { items, total } = await deps.uow.asOrg(ctx, async (r) => ({ items: await r.audit.list(ctx.orgId, page), total: await r.audit.count(ctx.orgId) }));
  return ok({
    items: items.map((e) => ({ id: e.id, at: e.at.toISOString(), actorId: e.actorId, actorName: e.actorName, action: e.action, targetType: e.targetType, targetId: e.targetId, targetLabel: e.targetLabel, detail: e.detail })),
    total, limit: page.limit, offset: page.offset,
  });
}
