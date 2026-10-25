import { UNPAGED_LIST_CAP, type Dossier, type DossierFilter, type Page, type PageQuery } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { toDossier, withCustoms } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

/**
 * Danh sách không phân trang (màn lọc/tìm/sắp xếp phía client, bảng điều khiển, ô chọn hồ sơ): mới nhất trước,
 * chặn trên UNPAGED_LIST_CAP dòng để một doanh nghiệp lớn không kéo cả bảng. Cần đủ → dùng listDossiersPage.
 */
export async function listDossiers(deps: DossierDeps, ctx: Ctx, filter: DossierFilter): Promise<Result<Dossier[]>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.dossiers.list(ctx.orgId, filter, { limit: UNPAGED_LIST_CAP, offset: 0 }));
  return ok(await withCustoms(deps, ctx, rows.map(toDossier)));
}

/** Một trang hồ sơ + tổng số khớp bộ lọc (phân trang phía server). */
export async function listDossiersPage(deps: DossierDeps, ctx: Ctx, filter: DossierFilter, page: PageQuery): Promise<Result<Page<Dossier>>> {
  const { items, total } = await deps.uow.asOrg(ctx, async (r) => ({ items: await r.dossiers.list(ctx.orgId, filter, page), total: await r.dossiers.count(ctx.orgId, filter) }));
  return ok({ items: await withCustoms(deps, ctx, items.map(toDossier)), total, limit: page.limit, offset: page.offset });
}
