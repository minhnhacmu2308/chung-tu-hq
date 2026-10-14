// Mở lại tờ khai để sửa: hồ sơ APPROVED chưa truyền, hoặc truyền bị FPT từ chối ngay bước khai trước (SEND_FAILED, chưa có số tờ khai).
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { CustomsDeps } from "./customs-ports.js";

export async function reopenDeclaration(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(ctx.orgId, dossierId));
  const rejectedBeforeNumber = !!result && result.state === "SEND_FAILED" && (result.raw?.progress ?? "APPROVED") === "APPROVED" && !result.declarationNo;
  if (dossier.status === "APPROVED" || (dossier.status === "SUBMITTED" && rejectedBeforeNumber)) {
    await deps.declarations.markDraft(ctx, dossierId);
    if (result) await deps.uow.asOrg(ctx, (r) => r.results.upsert({ ...result, state: "APPROVED", raw: { progress: "APPROVED" }, updatedAt: deps.clock.now() }));
    return ok(undefined);
  }
  if (dossier.status === "SUBMITTED" || dossier.status === "CLEARED") return err(domainError("DOSSIER_LOCKED", "Hải quan đã ghi nhận tờ khai – không mở lại được, dùng khai sửa đổi"));
  return err(domainError("INVALID_STATE", "Tờ khai chưa được duyệt"));
}

/** Worker gọi khi job customs-send hết số lần thử: outbox FAILED, trạng thái SEND_FAILED để người dùng Gửi lại. */
export async function markOutboxFailed(deps: CustomsDeps, input: { orgId: string; outboxId: string; reason: string }): Promise<Result<void>> {
  await deps.uow.asOrg({ orgId: asOrgId(input.orgId), userId: asUserId("") }, async (r) => {
    const ob = await r.outbox.get(input.orgId, input.outboxId);
    if (!ob || ob.status !== "PENDING") return;
    const now = deps.clock.now();
    await r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: ob.dossierId, operation: ob.operation, direction: "IN", result: "ERROR", summary: `Không gửi được sau nhiều lần thử: ${input.reason} – bấm Gửi lại`, payloadMasked: { error: input.reason }, externalRef: null, at: now });
    await r.outbox.update(ob.id, { status: "FAILED", lastError: input.reason, updatedAt: now });
    const result = await r.results.get(input.orgId, ob.dossierId);
    if (result) await r.results.upsert({ ...result, state: "SEND_FAILED", updatedAt: now });
  });
  return ok(undefined);
}
