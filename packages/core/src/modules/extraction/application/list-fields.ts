import type { ExtractedField } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { toField } from "./_dto.js";
import type { ExtractionDeps } from "./ports.js";

export async function listFields(deps: ExtractionDeps, ctx: Ctx, dossierId: string): Promise<Result<ExtractedField[]>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.fields.list(ctx.orgId, dossierId));
  // Trường dòng hàng không gắn shipment = giá trị đã xác nhận của dòng đang bị gộp vào dòng khác (giữ để tách lại) – không hiện.
  return ok(rows.filter((r) => !(r.group === "ITEMS" && r.shipmentPath === null)).map(toField));
}
