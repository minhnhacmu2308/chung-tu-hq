// Bảng đối chiếu mã (spec §4): mỗi dòng một mã nối + mã ở mọi bộ (bí danh ACTIVE), tên, HS, ĐVT gốc, hệ số quy đổi. Mọi vai trò được xuất.
import type { CrossReference, CrossReferenceRow } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import type { CatalogDeps } from "./ports.js";

export async function exportCrossReference(deps: CatalogDeps, ctx: Ctx): Promise<Result<CrossReference>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const sets = await r.codeSets.list(ctx.orgId);
    const items = await r.items.list(ctx.orgId, { status: "ACTIVE" });
    const aliases = await r.aliases.listByOrg(ctx.orgId, { status: "ACTIVE" });
    const convs = await r.conversions.listByOrg(ctx.orgId);
    const rows = new Map<string, CrossReferenceRow>(items.map((i) => [i.id, { itemNo: i.itemNo, name: i.name, hs: i.hsCode, baseUnit: i.baseUnit, codes: {}, factors: {} }]));
    for (const a of aliases) {
      const row = rows.get(a.itemId);
      if (row) (row.codes[a.codeSetId] ??= []).push(a.code);
    }
    for (const c of convs) {
      const row = rows.get(c.itemId);
      if (row) row.factors[c.unit] = c.factor;
    }
    return ok({ codeSets: sets.map((s) => ({ id: s.id, kind: s.kind, name: s.name })), rows: [...rows.values()] });
  });
}
