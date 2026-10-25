// Khai chính thức cả lô (spec tách tờ khai – gọi về 1.51 §1.2): một lần bấm → khai chính thức (IDC/IDE/EDC/EDE) tờ đầu tiên đang khai tạm,
// worker nối tiếp từng tờ sau khi tờ trước SENT (outbox mang chain = "declare", xem process-outbox.chainDeclare).
// Tái dùng mọi guard của performOperation cho tờ đích (không nhân bản); thêm bất biến 7 (HS đủ, không BLOCKER) như khai tạm.
import { awaitingContent, branchCount, type OperationResult } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError, type DomainError } from "../../../shared/errors.js";
import { err, type Result } from "../../../shared/result.js";
import { stageOf } from "../domain/state-machine.js";
import { declareOpFor } from "./branch-send.js";
import type { CustomsDeps } from "./customs-ports.js";
import { performOperation } from "./perform-operation.js";

/** Bất biến 7 cho khai chính thức cả lô: HS chưa xác nhận hoặc còn BLOCKER FAIL → không khai (kiểm ở tờ đầu và ở mỗi tờ nối tiếp của worker). */
export async function declareBlockError(deps: CustomsDeps, ctx: Pick<Ctx, "orgId">, dossierId: string, snap: { unconfirmedHs: number }): Promise<DomainError | null> {
  if (snap.unconfirmedHs > 0) return reasonError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: snap.unconfirmedHs });
  const blockers = await deps.validation.blockerFails(ctx.orgId, dossierId);
  return blockers > 0 ? reasonError("BLOCKER_FAILED", "BLOCKER_RULES_FAILED", { n: blockers }) : null;
}

export async function declareAllSheets(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<OperationResult>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  const of = branchCount(snap.payload.items.length);
  if (of <= 1) return err(domainError("VALIDATION", "Khai chính thức cả lô chỉ dùng cho lô nhiều tờ"));
  const { results, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ results: await r.results.listForDossier(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId) }));
  if (outbox.some((o) => o.status === "PENDING")) return err(domainError("INVALID_STATE", "Đang gửi nghiệp vụ khác – chờ xong rồi khai chính thức cả lô"));
  const sheets = results.filter((r) => r.branch <= of).sort((a, b) => a.branch - b.branch);
  // Còn tờ chờ gửi nội dung (chưa khai tạm / đã gọi về chưa gửi lại) → chờ khai tạm xong cả lô (cùng lý do thứ tự tờ khai chính thức).
  const waiting = sheets.find((s) => awaitingContent(stageOf(s)));
  if (waiting) return err(reasonError("INVALID_STATE", "SHEET_ORDER_DECLARE", { sheet: Math.min(waiting.branch + 1, of), waitFor: waiting.branch }));
  const target = sheets.find((s) => declareOpFor(stageOf(s), snap.payload.kind));
  if (!target) return err(domainError("INVALID_STATE", "Không còn tờ nào chờ khai chính thức"));
  const blocked = await declareBlockError(deps, ctx, dossierId, snap);
  if (blocked) return err(blocked);
  return performOperation(deps, ctx, dossierId, declareOpFor(stageOf(target), snap.payload.kind)!, target.branch, { chain: "declare" });
}
