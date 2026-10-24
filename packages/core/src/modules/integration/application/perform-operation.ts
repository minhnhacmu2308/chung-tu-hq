// Thực hiện một nghiệp vụ của luồng Khai báo Hải quan (sau lần khai tạm đầu tiên): kiểm theo customs-flow.operationAvailability,
// nghiệp vụ gửi nội dung giữ bất biến 7, tạo outbox (idempotency theo số lần gửi) → job customs-send. Tra cứu IID/IEX trả lời ngay.
import {
  baseOp, CUSTOMS_OPERATIONS, isContentOperation, operationAvailability, queryOpFor, sameRateWeek, vnDateOf, weekStart,
  type CustomsOperation, type OperationResult,
} from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { buildFptRequest } from "../domain/declaration-to-fpt.js";
import { mergeCustomsInfo } from "../domain/customs-info.js";
import { buildAmaRequest } from "../domain/post-amendment.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import { availabilityInput, OPERATION_LABELS } from "./_customs-view.js";
import type { CustomsDeps, OutboxRow, ResultRow } from "./customs-ports.js";
import { createPostAmendment, isPostStage, openPostAmendment } from "./post-amendment.js";

export async function performOperation(deps: CustomsDeps, ctx: Ctx, dossierId: string, op: CustomsOperation): Promise<Result<OperationResult>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  const { result, outbox, amendment } = await deps.uow.asOrg(ctx, async (r) => ({ result: await r.results.get(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId), amendment: await openPostAmendment(r, ctx.orgId, dossierId) }));
  if (!result) return err(reasonError("INVALID_STATE", "NOT_SUBMITTED_YET"));
  if (op === queryOpFor(dossier.direction) || CUSTOMS_OPERATIONS[op].kind === "query") return queryNow(deps, ctx, dossierId, dossier.direction, result);

  // Sau thông quan: "đã duyệt" là bản khai bổ sung AMA (tờ khai gốc giữ nguyên, không duyệt lại).
  const approved = isPostStage(result) ? amendment?.status === "APPROVED" : snap.status === "APPROVED";
  const flow = { direction: dossier.direction, approved, hasContainers: snap.payload.containers.length > 0 };
  const a = operationAvailability(availabilityInput(flow, result, outbox)).find((x) => x.op === op);
  if (!a) return err(domainError("VALIDATION", `Nghiệp vụ ${op} không thuộc luồng tờ khai ${dossier.direction === "NK" ? "nhập" : "xuất"} khẩu`));
  if (!a.enabled) return err(a.reasonCode ? reasonError("INVALID_STATE", a.reasonCode, a.reasonParams) : domainError("INVALID_STATE", `Chưa thực hiện được ${op}`));
  if (a.action === "EDIT") return err(reasonError("INVALID_STATE", a.reasonCode ?? "EDIT_DECLARATION_FIRST", a.reasonParams));
  if (a.action === "START_POST_EDIT") return err(reasonError("INVALID_STATE", "START_POST_EDIT_FIRST"));

  let payload: Record<string, unknown> = { request: { soToKhai: result.declarationNo }, certificateId: result.raw?.certificateId };
  if (op === "AMA") {
    // Bản khai bổ sung riêng: đã duyệt, đủ dòng hàng + mã lý do; tờ khai gốc không gửi lại, không đổi trạng thái.
    if (amendment?.status !== "APPROVED") return err(reasonError("NOT_APPROVED", "AMENDMENT_NOT_APPROVED"));
    const built = buildAmaRequest(amendment);
    if (built.blockers.length) return err(reasonError("BLOCKER_FAILED", "AMENDMENT_NOT_TRANSMITTABLE", { blockers: built.blockers.join("; ") }));
    payload = { request: built.request, warnings: built.warnings, issues: built.issues, certificateId: result.raw?.certificateId, amendmentId: amendment.id };
    return enqueue(deps, ctx, { dossierId, declarationId: snap.declarationId, op, payload, result, outbox, content: false });
  }
  if (isContentOperation(op)) {
    // Bất biến 7: chỉ gửi nội dung tờ khai đã duyệt, HS đủ, không còn BLOCKER.
    if (snap.status !== "APPROVED") return err(reasonError("NOT_APPROVED", "DECLARATION_NOT_REAPPROVED"));
    if (snap.unconfirmedHs > 0) return err(reasonError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: snap.unconfirmedHs }));
    const blockers = await deps.validation.blockerFails(ctx.orgId, dossierId);
    if (blockers > 0) return err(reasonError("BLOCKER_FAILED", "BLOCKER_RULES_FAILED", { n: blockers }));
    if (baseOp(op) === "IDA" && !sameRateWeek(snap.exchangeRateDate, vnDateOf(deps.clock.now())))
      return err(reasonError("RATE_WEEK_CHANGED", "RATE_WEEK_CHANGED_REBUILD", { week: weekStart(snap.exchangeRateDate) }));
    const built = buildFptRequest(snap.payload);
    if (built.blockers.length) return err(reasonError("BLOCKER_FAILED", "DECLARATION_NOT_TRANSMITTABLE", { blockers: built.blockers.join("; ") }));
    payload = { request: built.request, warnings: built.warnings, issues: built.issues, certificateId: result.raw?.certificateId };
  } else if (op === "HYS") {
    payload = { files: (await deps.dossiers.documents(ctx.orgId, dossierId)).map((d) => ({ name: d.fileName, storageKey: d.storageKey })), certificateId: result.raw?.certificateId };
  } else if (op === "CONT" || op === "PORT_FEE") {
    payload = { request: { soToKhai: result.declarationNo, containers: snap.payload.containers }, certificateId: result.raw?.certificateId };
  }
  return enqueue(deps, ctx, { dossierId, declarationId: snap.declarationId, op, payload, result, outbox, content: isContentOperation(op) });
}

/** Tạo outbox + job. Khóa idempotency theo số lần gửi nghiệp vụ (hai yêu cầu song song cùng khóa → unique, chỉ một lần gửi). */
export async function enqueue(
  deps: CustomsDeps, ctx: Ctx,
  p: { dossierId: string; declarationId: string; op: CustomsOperation; payload: unknown; result: ResultRow; outbox: OutboxRow[]; content: boolean },
): Promise<Result<OperationResult>> {
  const now = deps.clock.now();
  const n = p.outbox.filter((o) => o.operation === p.op).length + 1;
  const row: OutboxRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId: p.dossierId, branch: 1, declarationId: p.declarationId, operation: p.op, idempotencyKey: `${p.dossierId}:${p.op}:n${n}`, payload: p.payload, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now };
  const created = await deps.uow.asOrg(ctx, async (r) => {
    try {
      await r.outbox.insert(row);
    } catch (e) {
      if (/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) return err(domainError("ALREADY_SUBMITTED", `${OPERATION_LABELS[p.op]} đang được gửi – không gửi trùng`));
      throw e;
    }
    // Gửi mới sau một lần lỗi: bỏ cờ lỗi gửi, giữ giai đoạn.
    if (p.result.state === "SEND_FAILED") await r.results.upsert({ ...p.result, state: coarseState(stageOf(p.result)), updatedAt: now });
    return ok(row);
  });
  if (!created.ok) return created;
  if (p.content) {
    await deps.declarations.markSubmitted(ctx, p.dossierId);
    await deps.dossiers.update(ctx.orgId, p.dossierId, { status: "SUBMITTED", step: "submit" });
  }
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: row.id }, { jobId: `customs-send:${row.id}` });
  await deps.dossiers.publish(ctx.orgId, p.dossierId, { type: "customs.message" });
  return ok({ sent: true, message: `Đang gửi ${OPERATION_LABELS[p.op].toLowerCase()} (${p.op})` });
}

/** Tra cứu trạng thái tờ khai (IID nhập / IEX xuất) – trả lời ngay, ghi nhật ký OUT/IN. */
async function queryNow(deps: CustomsDeps, ctx: Ctx, dossierId: string, direction: "NK" | "XK", result: ResultRow): Promise<Result<OperationResult>> {
  if (!result.externalId) return err(domainError("INVALID_STATE", "Chưa có số tờ khai để tra cứu"));
  const op = queryOpFor(direction);
  const now = () => deps.clock.now();
  await deps.uow.asOrg(ctx, (r) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: 1, operation: op, direction: "OUT", result: "OK", summary: `Tra cứu trạng thái tờ khai (${op})`, payloadMasked: { nghiepVu: op, soToKhai: result.declarationNo }, externalRef: result.externalId, at: now() }));
  const st = await deps.gateway.queryStatus(ctx.orgId, result.externalId, dossierId);
  await meterSafely(deps.usage, { orgId: ctx.orgId, dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: op, quantity: 1 });
  const stage = stageOf(result);
  const cleared = st.cleared && (stage === "DECLARED" || stage === "AMEND_PRE_DECLARED" || stage === "AMEND_RECALLED");
  const nextStage = st.rejected ? "REJECTED" : cleared ? "CLEARED" : stage;
  await deps.uow.asOrg(ctx, async (r) => {
    await r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: 1, operation: op, direction: "IN", result: "OK", summary: `Trạng thái tờ khai: ${st.status}`, payloadMasked: { nghiepVu: op, soToKhai: st.declarationNo ?? result.declarationNo, trangThai: st.status, phanLuong: st.channel }, externalRef: result.externalId, at: now() });
    await r.results.upsert({
      ...result, state: coarseState(nextStage, result.state === "SEND_FAILED" && nextStage === stage),
      ...(stage !== "NOT_SENT" && stage !== "PRE_DECLARED" && stage !== "RECALLED" ? { clearanceStatus: st.rejected ? "REJECTED" as const : st.cleared ? "CLEARED" as const : "INSPECTING" as const } : {}),
      raw: { ...(result.raw ?? {}), stage: nextStage, lastStatus: st.status, ...(st.info ? { customsInfo: mergeCustomsInfo(result.raw?.customsInfo, { ...st.info, receivedAt: now().toISOString() }) } : {}) }, updatedAt: now(),
    });
  });
  if (cleared) await deps.dossiers.update(ctx.orgId, dossierId, { status: "CLEARED" });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok({ sent: false, message: `Trạng thái tờ khai: ${st.status}` });
}

/** Đã thông quan → lập bản khai bổ sung AMA (giai đoạn POST_EDITING). Tờ khai gốc giữ nguyên – không mở lại. */
export async function startPostAmendment(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const { result, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ result: await r.results.get(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId) }));
  if (!result || stageOf(result) !== "CLEARED") return err(domainError("INVALID_STATE", "Chỉ sửa đổi sau thông quan khi tờ khai đã thông quan"));
  if (outbox.some((o) => o.status === "PENDING")) return err(domainError("INVALID_STATE", "Đang chờ phản hồi một nghiệp vụ khác"));
  await deps.uow.asOrg(ctx, async (r) => {
    await createPostAmendment(deps, r, ctx, dossierId, result);
    await r.results.upsert({ ...result, state: coarseState("POST_EDITING"), raw: { ...(result.raw ?? {}), stage: "POST_EDITING" }, updatedAt: deps.clock.now() });
  });
  await deps.dossiers.update(ctx.orgId, dossierId, { step: "review" });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok(undefined);
}
