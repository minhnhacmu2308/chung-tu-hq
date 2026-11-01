import { dossierCustomsSummary, type DossierCustomsSummary } from "@kb/contracts";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { stageOf } from "../domain/state-machine.js";
import type { CustomsDeps } from "./customs-ports.js";

/**
 * Trạng thái hồ sơ gộp từ mọi tờ khai nhánh (spec §6.5): mọi tờ thông quan → hồ sơ CLEARED (không thêm giá trị trạng thái hồ sơ).
 * Gọi sau mỗi lần một tờ có thể vừa thông quan (hỏi trạng thái, tra cứu, AMC). Lô một tờ: như trước.
 */
export async function syncDossierClearance(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string): Promise<DossierCustomsSummary> {
  const results = await deps.uow.asOrg(ctx, (r) => r.results.listForDossier(ctx.orgId, dossierId));
  const summary = dossierCustomsSummary(results.map((r) => ({ stage: stageOf(r), state: r.state })));
  if (summary.allCleared) await deps.dossiers.update(ctx.orgId, dossierId, { status: "CLEARED" });
  return summary;
}

