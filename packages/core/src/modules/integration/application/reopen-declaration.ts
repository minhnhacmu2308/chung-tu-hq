// Mở lại tờ khai để sửa: hồ sơ APPROVED chưa truyền, hoặc truyền bị FPT từ chối ngay bước khai trước (SEND_FAILED, chưa có số tờ khai).
// Lô nhiều tờ: chỉ tiêu chung dùng chung → mở lại là mở CẢ BỘ (một tờ khai DRAFT); tờ đã có số giữ giai đoạn, sau duyệt lại truyền lại theo giai đoạn
// từng tờ (submitDeclaration). Lô nhiều tờ chỉ mở lại khi MỌI tờ đã có số đang gọi về sửa (RECALLED / AMEND_RECALLED – quyết định R3).
import { EDITING_STAGES } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import { recallFirstError } from "./branch-send.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { CustomsDeps } from "./customs-ports.js";

export async function reopenDeclaration(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const results = await deps.uow.asOrg(ctx, (r) => r.results.listForDossier(ctx.orgId, dossierId));
  const result = results.find((r) => r.branch === 1) ?? null;
  const rejectedBeforeNumber = !!result && result.state === "SEND_FAILED" && stageOf(result) === "NOT_SENT" && !result.declarationNo;
  // Đang ở giai đoạn sửa (đã gọi về / mở sửa sau thông quan – ở bất kỳ tờ nào) mà tờ khai đã duyệt lại: mở lại để sửa tiếp, giữ giai đoạn.
  const editing = results.find((r) => EDITING_STAGES.has(stageOf(r)));
  // Lô nhiều tờ: tờ đã có số chưa gọi về sửa → Hải quan giữ chỉ tiêu chung cũ trên tờ đó; gọi về (IDB/IDD) trước (lô một tờ: như trước).
  const recall = recallFirstError(results);
  if (recall && (dossier.status === "APPROVED" || dossier.status === "SUBMITTED" || dossier.status === "CLEARED")) return err(recall);
  if (dossier.status === "APPROVED" && editing) {
    await deps.declarations.markDraft(ctx, dossierId);
    await deps.orgAudit?.record(ctx, { action: "DECLARATION_REOPENED", targetType: "dossier", targetId: dossierId, targetLabel: dossier.code, detail: { stage: stageOf(editing), ...(results.length > 1 ? { branch: editing.branch } : {}) } });
    return ok(undefined);
  }
  if (dossier.status === "APPROVED" || (dossier.status === "SUBMITTED" && rejectedBeforeNumber)) {
    await deps.declarations.markDraft(ctx, dossierId);
    // Bỏ cờ lỗi gửi của tờ chưa có số; tờ đã có số giữ nguyên (lô một tờ: như trước).
    const reset = results.length <= 1 ? results : results.filter((r) => stageOf(r) === "NOT_SENT" && !r.declarationNo);
    if (reset.length) await deps.uow.asOrg(ctx, async (r) => {
      for (const x of reset) await r.results.upsert({ ...x, state: "APPROVED", raw: { ...(x.raw ?? {}), stage: "NOT_SENT" }, updatedAt: deps.clock.now() });
    });
    await deps.orgAudit?.record(ctx, { action: "DECLARATION_REOPENED", targetType: "dossier", targetId: dossierId, targetLabel: dossier.code, ...(rejectedBeforeNumber ? { detail: { reason: "SEND_FAILED" } } : {}) });
    return ok(undefined);
  }
  if (dossier.status === "SUBMITTED" || dossier.status === "CLEARED") return err(domainError("DOSSIER_LOCKED", "Hải quan đã ghi nhận tờ khai – không mở lại được, dùng nghiệp vụ gọi sửa (IDB/IDD) hoặc sửa sau thông quan (AMA)"));
  return err(domainError("INVALID_STATE", "Tờ khai chưa được duyệt"));
}

/** Worker gọi khi job customs-send hết số lần thử: outbox FAILED, trạng thái SEND_FAILED để người dùng Gửi lại. */
export async function markOutboxFailed(deps: CustomsDeps, input: { orgId: string; outboxId: string; reason: string }): Promise<Result<void>> {
  await deps.uow.asOrg({ orgId: asOrgId(input.orgId), userId: asUserId("") }, async (r) => {
    const ob = await r.outbox.get(input.orgId, input.outboxId);
    if (!ob || ob.status !== "PENDING") return;
    const now = deps.clock.now();
    await r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: ob.dossierId, branch: ob.branch, operation: ob.operation, direction: "IN", result: "ERROR", summary: `Không gửi được sau nhiều lần thử: ${input.reason} – bấm Gửi lại`, payloadMasked: { error: input.reason }, externalRef: null, at: now });
    await r.outbox.update(ob.orgId, ob.id, { status: "FAILED", lastError: input.reason, updatedAt: now });
    const result = await r.results.get(input.orgId, ob.dossierId, ob.branch);
    if (result) await r.results.upsert({ ...result, state: coarseState(stageOf(result), true), updatedAt: now });
  });
  return ok(undefined);
}
