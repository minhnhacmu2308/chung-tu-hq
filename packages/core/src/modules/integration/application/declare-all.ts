// Khai chính thức cả lô (spec tách tờ khai – gọi về 1.51 §1.2): một lần bấm → khai chính thức (IDC/IDE/EDC/EDE) tờ đầu tiên đang khai tạm,
// worker nối tiếp từng tờ sau khi tờ trước SENT (outbox mang chain = "declare", xem process-outbox.chainDeclare).
// Tái dùng mọi guard của performOperation cho tờ đích (không nhân bản); thêm bất biến 7 (HS đủ, không BLOCKER) như khai tạm.
import { awaitingContent, branchCount, type OperationResult } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, type Result } from "../../../shared/result.js";
import { stageOf } from "../domain/state-machine.js";
import { declareOpFor } from "./branch-send.js";
import type { CustomsDeps } from "./customs-ports.js";
import { performOperation } from "./perform-operation.js";

export async function declareAllSheets(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<OperationResult>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  const of = branchCount(snap.payload.items.length);
  if (of <= 1) return err(reasonError("VALIDATION", "DECLARE_ALL_SINGLE_SHEET"));
  const { results, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ results: await r.results.listForDossier(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId) }));
  if (outbox.some((o) => o.status === "PENDING")) return err(reasonError("INVALID_STATE", "DECLARE_ALL_PENDING"));
  const sheets = results.filter((r) => r.branch <= of).sort((a, b) => a.branch - b.branch);
  // Còn tờ chờ gửi nội dung (chưa khai tạm / đã gọi về chưa gửi lại) → chờ khai tạm xong cả lô (cùng lý do thứ tự tờ khai chính thức).
  const waiting = sheets.find((s) => awaitingContent(stageOf(s)));
  if (waiting) {
    // "Tờ {sheet}" = tờ đầu tiên sau tờ đang chờ mà đang chờ khai chính thức; không có → câu thường nêu tờ chưa khai tạm xong.
    const blocked = sheets.find((s) => s.branch > waiting.branch && declareOpFor(stageOf(s), snap.payload.kind));
    return err(blocked ? reasonError("INVALID_STATE", "SHEET_ORDER_DECLARE", { sheet: blocked.branch, waitFor: waiting.branch }) : reasonError("INVALID_STATE", "DECLARE_ALL_NOT_PRE_DECLARED", { sheet: waiting.branch }));
  }
  // Tờ khai đang mở lại để sửa (DRAFT) → không bắt đầu chuỗi (chuỗi cũng dừng ở tờ kế khi DRAFT – process-outbox.chainSheets).
  if (snap.status === "DRAFT") return err(reasonError("NOT_APPROVED", "DECLARATION_NOT_REAPPROVED"));
  const target = sheets.find((s) => declareOpFor(stageOf(s), snap.payload.kind));
  if (!target) return err(reasonError("INVALID_STATE", "DECLARE_ALL_NONE"));
  // HS / BLOCKER: performOperationChecked kiểm cho mọi khai chính thức lô nhiều tờ (bất biến 7).
  return performOperation(deps, ctx, dossierId, declareOpFor(stageOf(target), snap.payload.kind)!, target.branch, { chain: "declare" });
}
