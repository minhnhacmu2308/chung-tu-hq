// Gửi bộ HYS (spec §2.2): kiểm bộ + chứng thư → một giao dịch (attempt+1, SENDING, purpose, outbox `hys:<id>:n<attempt>`) → xếp job customs-send.
// Không đòi tờ khai đã duyệt / HS xác nhận / không BLOCKER (HYS khai trước IDA). Gửi lại sau SEND_FAILED mà bộ đã có số tiếp nhận → chỉ chuyển ACCEPTED.
import { attachmentPairs, checkHysSubmission, HYS_MAX_SLOTS, type AttachmentValues, type HysIssue, type HysSubmissionView, type SendHysInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { CustomsDeps, OutboxRow } from "./customs-ports.js";
import { editable, HYS_ROLES, hysValuesOf, lotEditableOf, viewOf } from "./hys-submissions.js";

/** Vấn đề của bộ → chuỗi ngắn cho params (giao diện dịch theo reason; danh sách đầy đủ ở details). */
const describeIssues = (issues: HysIssue[]): string => issues.map((i) => [i.code, i.file ?? i.field ?? i.bytes].filter((x) => x !== undefined).join(" ")).join(", ");

/**
 * Lô còn sửa được mà 1.63/2.53 đã đủ 3 cặp có số → bắt buộc `replaceSlot` (cặp sẽ bị thay khi Hải quan cấp số), thiếu → HYS_SLOTS_FULL.
 * `replaceSlot` đi trong payload outbox (không có cột riêng).
 */
export async function sendHysSubmission(deps: CustomsDeps, ctx: Ctx, dossierId: string, id: string, input: SendHysInput): Promise<Result<HysSubmissionView>> {
  const allowed = requireRole(ctx, ...HYS_ROLES);
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const now = deps.clock.now();

  // Đã có số tiếp nhận (lỗi gửi xảy ra sau khi Hải quan cấp số) → không gửi lại, chỉ chuyển ACCEPTED.
  const recovered = await deps.uow.asOrg(ctx, async (r) => {
    const cur = await editable(r, ctx.orgId, dossierId, id);
    if (!cur.ok) return cur;
    if (cur.value.status !== "SEND_FAILED" || !cur.value.receiptNo) return ok(null);
    await r.hys.update(ctx.orgId, id, { status: "ACCEPTED", reject: null, updatedAt: now });
    return ok(await viewOf(r, ctx.orgId, id));
  });
  if (!recovered.ok) return recovered;
  if (recovered.value) {
    await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
    return ok(recovered.value);
  }

  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa dựng tờ khai – không gửi được HYS"));
  const { certificateId, replaceSlot } = input;
  if (!certificateId || !(await deps.certificates.exists(ctx.orgId, certificateId))) return err(reasonError("NO_CERT", "CERTIFICATE_REQUIRED"));

  const sent = await deps.uow.asOrg(ctx, async (r) => {
    const cur = await editable(r, ctx.orgId, dossierId, id);
    if (!cur.ok) return cur;
    const row = cur.value;
    const files = await r.hys.files(ctx.orgId, id);
    const issues = checkHysSubmission({ procedureCode: row.procedureCode, customsOffice: row.customsOffice, processingUnit: row.processingUnit, phone: row.phone, internalRef: row.internalRef, note: row.note, files: files.map((f) => ({ fileName: f.fileName, sizeBytes: f.sizeBytes })) });
    if (issues.length) return err(reasonError("VALIDATION", "HYS_INVALID", { issues: describeIssues(issues) }, { issues }));
    const lotEditable = lotEditableOf(snap, await r.results.listForDossier(ctx.orgId, dossierId), await r.outbox.listForDossier(ctx.orgId, dossierId));
    const slotsFull = attachmentPairs(hysValuesOf(snap) as AttachmentValues).length >= HYS_MAX_SLOTS;
    if (lotEditable && slotsFull && !replaceSlot) return err(reasonError("VALIDATION", "HYS_SLOTS_FULL", { field: snap.payload.kind === "IDA" ? "1.63" : "2.53" }));
    const attempt = row.attempt + 1;
    const outbox: OutboxRow = {
      id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: 1, declarationId: snap.declarationId, operation: "HYS", idempotencyKey: `hys:${id}:n${attempt}`,
      payload: { submissionId: id, certificateId, ...(lotEditable && replaceSlot ? { replaceSlot } : {}) }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now,
    };
    try {
      await r.outbox.insert(outbox);
    } catch (e) {
      if (/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) return err(domainError("ALREADY_SUBMITTED", "Bộ HYS đang được gửi – không gửi trùng"));
      throw e;
    }
    await r.hys.update(ctx.orgId, id, { attempt, status: "SENDING", purpose: lotEditable ? "PRE_DECLARATION" : "SUPPLEMENT", reject: null, fill: null, sentBy: ctx.userId, sentAt: now, updatedAt: now });
    return ok({ outboxId: outbox.id, view: await viewOf(r, ctx.orgId, id) });
  });
  if (!sent.ok) return sent;
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: sent.value.outboxId }, { jobId: `customs-send:${sent.value.outboxId}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok(sent.value.view);
}
