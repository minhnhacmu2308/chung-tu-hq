// Gọi về tất cả tờ (spec tách tờ khai IDC/gọi về §2.2): một lần bấm → gọi về tờ đầu tiên còn hiệu lực ở Hải quan, worker nối tiếp từng tờ sau
// khi tờ trước SENT (outbox mang chain = "recall", xem process-outbox.chainNextBranch). Mỗi tờ dùng nghiệp vụ gọi về operationAvailability đang bật
// cho giai đoạn của tờ (PRE_DECLARED → IDB/EDB; DECLARED, AMEND_PRE_DECLARED → IDD/EDD). Lệnh gọi về cuối thành công → tự mở lại tờ khai (process-outbox).
import { branchCount, isActiveSheet, operationAvailability, recallOpFor, sheetApproved, type CustomsOperation, type RecallAllResult } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { stageOf } from "../domain/state-machine.js";
import { availabilityInput } from "./_customs-view.js";
import type { CustomsDeps, DeclarationSnapshot, OutboxRow, ResultRow } from "./customs-ports.js";
import { performOperation } from "./perform-operation.js";

/** Tờ đích của gọi về tất cả: tờ còn hiệu lực ở Hải quan, kèm nghiệp vụ gọi về đang bật (null = chưa gọi về được lúc này). */
export type RecallTarget = { branch: number; op: CustomsOperation | null };

/**
 * Tờ đích theo thứ tự tờ (thuần): tờ trong số tờ hiện tại có số tờ khai, chưa gọi về, không miễn gọi về (isActiveSheet).
 * Dùng chung recallAllSheets (kiểm trước cả lô) và chuỗi nối tiếp của worker (tờ đích kế tiếp).
 */
export function recallTargets(snap: DeclarationSnapshot, results: ResultRow[], outbox: OutboxRow[]): RecallTarget[] {
  const of = branchCount(snap.payload.items.length);
  const flow = (r: ResultRow) => ({ direction: snap.payload.direction, approved: sheetApproved({ stage: stageOf(r), of, declarationStatus: snap.status }), hasContainers: snap.payload.containers.length > 0 });
  return results
    .filter((r) => r.branch <= of && isActiveSheet({ stage: stageOf(r), declarationNo: r.declarationNo }))
    .sort((a, b) => a.branch - b.branch)
    .map((r) => ({ branch: r.branch, op: recallOpFor(operationAvailability(availabilityInput(flow(r), r, outbox.filter((o) => o.branch === r.branch)))) }));
}

export async function recallAllSheets(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<RecallAllResult>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  if (branchCount(snap.payload.items.length) <= 1) return err(domainError("VALIDATION", "Gọi về tất cả chỉ dùng cho lô nhiều tờ"));
  const { results, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ results: await r.results.listForDossier(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId) }));
  const targets = recallTargets(snap, results, outbox);
  if (!targets.length) return err(domainError("INVALID_STATE", "Không còn tờ nào cần gọi về"));
  // Kiểm trước cả lô: có tờ đích chưa gọi về được (đang chờ phản hồi nghiệp vụ khác) → từ chối cả lần, không gửi tờ nào.
  const blocked = targets.filter((t) => !t.op);
  if (blocked.length) return err(reasonError("INVALID_STATE", "RECALL_ALL_BLOCKED", { sheets: blocked.map((t) => t.branch).join(", ") }));
  const first = targets[0]!;
  const res = await performOperation(deps, ctx, dossierId, first.op!, first.branch, { chain: "recall" });
  if (!res.ok) return res;
  return ok({ ...res.value, sheets: targets.map((t) => t.branch) });
}
