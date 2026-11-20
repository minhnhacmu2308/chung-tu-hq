// Số định danh xin theo lô (menu Nghiệp vụ khác): một lần bấm = N dòng `customs_identifiers` không gắn hồ sơ, gửi nền qua job `identifier-send`
// như gửi theo hồ sơ (identifier.ts). Hồ sơ chọn một số còn dùng được (useIdentifier); dòng lỗi gửi lại (retryIdentifier) hoặc xóa mềm.
import type { IdentifierBatchRequest, IdentifierList, IdentifierListItem, IdentifierListQuery } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { identifierDisplayStatus, identifierExpiresOn, isExpiringSoon, vnToday } from "../domain/identifier-status.js";
import type { CustomsDeps, IdentifierRow } from "./customs-ports.js";
import { identifierRecord, identifierSendJobId, pollIdentifier, type IdentifierBatchDoneInput, type IdentifierSendInput } from "./identifier.js";
import { isDuplicate, KVGS_ROLES } from "./kvgs.js";

const batchOf = (rows: IdentifierRow[]) => ({ batchId: rows[0]!.batchId!, ids: rows.map((r) => r.id) });

/**
 * Xin N số định danh. `clientKey` (UUID client sinh) làm `batch_id`: bấm lại / mạng gửi lặp → trả lô đã có, không tạo dòng, không xếp job
 * (không tính phí FPT hai lần). Input đã parse Zod (IdentifierBatchRequestSchema) ở route.
 */
export async function requestIdentifierBatch(deps: CustomsDeps, ctx: Ctx, input: IdentifierBatchRequest): Promise<Result<{ batchId: string; ids: string[] }>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const batchId = input.clientKey;
  const existing = () => deps.uow.asOrg(ctx, (r) => r.identifiers.listByBatch(ctx.orgId, batchId));
  const had = await existing();
  if (had.length) return ok(batchOf(had));
  const now = deps.clock.now();
  const rows: IdentifierRow[] = Array.from({ length: input.count }, (_, i) => ({
    id: deps.idGen.next("idn"), orgId: ctx.orgId, dossierId: null, attempt: 1, status: "SENDING", request: input.request, refId: null, receiptNo: null, receiptDate: null,
    customsState: null, identifierNo: null, identifiedOn: null, qrPng: null, resultText: null, errors: null, sendAttempts: 0, sentBy: ctx.userId, sentAt: now,
    batchId, batchIndex: i + 1, usedAt: null, usedByDossierId: null, deletedAt: null, deletedBy: null, createdAt: now, updatedAt: now,
  }));
  try {
    await deps.uow.asOrg(ctx, (r) => r.identifiers.insertMany(rows));
  } catch (e) {
    // Hai request cùng clientKey song song: bên chậm trùng (org_id, batch_id, batch_index) → trả lô bên kia đã tạo.
    if (!isDuplicate(e)) throw e;
    return ok(batchOf(await existing()));
  }
  for (const row of rows) await deps.queue.enqueue("identifier-send", { orgId: ctx.orgId, userId: ctx.userId, id: row.id, attempt: row.attempt } satisfies IdentifierSendInput, { jobId: identifierSendJobId(row) });
  return ok(batchOf(rows));
}

function listItem(row: IdentifierRow, today: string): IdentifierListItem {
  const usedAt = row.usedAt?.toISOString() ?? null;
  const displayStatus = identifierDisplayStatus({ ...row, usedAt }, today);
  const expiresOn = identifierExpiresOn(row.identifiedOn);
  return {
    ...identifierRecord(row), id: row.id, batchId: row.batchId, batchIndex: row.batchIndex, dossierId: row.dossierId, usedByDossierId: row.usedByDossierId, usedAt,
    expiresOn, expiringSoon: displayStatus === "AVAILABLE" && isExpiringSoon(expiresOn, today), displayStatus,
  };
}

/** Danh sách số định danh của doanh nghiệp (mọi thành viên). Hạn dùng tính theo ngày giờ Việt Nam. */
export async function listIdentifiers(deps: CustomsDeps, ctx: Ctx, q: IdentifierListQuery): Promise<Result<IdentifierList>> {
  const today = vnToday(deps.clock.now());
  const page = await deps.uow.asOrg(ctx, (r) => r.identifiers.list(ctx.orgId, q, today));
  return ok({ items: page.items.map((row) => listItem(row, today)), total: page.total, offset: q.offset, limit: q.limit, expiringCount: page.expiringCount });
}

/** Xóa mềm dòng REJECTED/NO_RESPONSE chưa có số (repo bỏ qua dòng khác, kể cả dòng vừa nhận số); ghi org_audit các dòng thực sự xóa. */
export async function deleteIdentifiers(deps: CustomsDeps, ctx: Ctx, ids: string[]): Promise<Result<{ deleted: string[] }>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const deleted = await deps.uow.asOrg(ctx, (r) => r.identifiers.softDelete(ctx.orgId, ids, ctx.userId, deps.clock.now()));
  if (deleted.length) await deps.orgAudit?.record(ctx, { action: "IDENTIFIER_DELETED", targetType: "customs_identifier", targetId: deleted[0]!, targetLabel: `${deleted.length} số định danh`, detail: { ids: deleted } });
  return ok({ deleted });
}

/** Hồ sơ dùng một số còn dùng được. Hết hạn → IDENTIFIER_EXPIRED; hồ sơ khác đã giữ (kể cả giành nhau cùng lúc) → IDENTIFIER_TAKEN. */
export async function useIdentifier(deps: CustomsDeps, ctx: Ctx, id: string, dossierId: string): Promise<Result<{ identifierNo: string }>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  // FK used_by_dossier_id không kiểm org → phải chắc hồ sơ thuộc doanh nghiệp này.
  if (!(await deps.dossiers.get(ctx.orgId, dossierId))) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const row = await deps.uow.asOrg(ctx, (r) => r.identifiers.get(ctx.orgId, id));
  // Dòng gửi từ hồ sơ (dossierId) không thuộc kho – hồ sơ khác không lấy được.
  if (!row || row.dossierId || row.deletedAt || !row.identifierNo) return err(domainError("NOT_FOUND", "Không tìm thấy số định danh"));
  const identifierNo = row.identifierNo;
  if (row.usedByDossierId === dossierId) return ok({ identifierNo }); // bấm lại: đã gắn đúng hồ sơ này
  const now = deps.clock.now();
  const status = identifierDisplayStatus({ ...row, usedAt: row.usedAt?.toISOString() ?? null }, vnToday(now));
  if (status === "EXPIRED") return err(reasonError("INVALID_STATE", "IDENTIFIER_EXPIRED"));
  if (status !== "AVAILABLE") return err(reasonError("INVALID_STATE", "IDENTIFIER_TAKEN"));
  if (!(await deps.uow.asOrg(ctx, (r) => r.identifiers.markUsed(ctx.orgId, id, dossierId, now)))) return err(reasonError("INVALID_STATE", "IDENTIFIER_TAKEN"));
  return ok({ identifierNo });
}

/** Hồ sơ trả lại số đang giữ (số về AVAILABLE). Không do hồ sơ này giữ → INVALID_STATE. */
export async function releaseIdentifier(deps: CustomsDeps, ctx: Ctx, id: string, dossierId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const released = await deps.uow.asOrg(ctx, (r) => r.identifiers.release(ctx.orgId, id, dossierId, deps.clock.now()));
  return released ? ok(undefined) : err(domainError("INVALID_STATE", "Hồ sơ không giữ số định danh này"));
}

/** Gửi lại một dòng lô bị từ chối / không phản hồi (chưa có số): chính dòng đó về SENDING, attempt + 1 → jobId mới (job cũ hoàn tất không chặn). */
export async function retryIdentifier(deps: CustomsDeps, ctx: Ctx, id: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const next = await deps.uow.asOrg(ctx, async (r): Promise<Result<IdentifierRow>> => {
    const row = await r.identifiers.get(ctx.orgId, id);
    if (!row || row.deletedAt) return err(domainError("NOT_FOUND", "Không tìm thấy số định danh"));
    if (!row.batchId || (row.status !== "REJECTED" && row.status !== "NO_RESPONSE") || row.identifierNo) return err(domainError("INVALID_STATE", "Chỉ gửi lại dòng lô bị từ chối hoặc không phản hồi"));
    const patch = { status: "SENDING", attempt: row.attempt + 1, refId: null, receiptNo: null, receiptDate: null, customsState: null, resultText: null, errors: null, sendAttempts: 0, updatedAt: deps.clock.now() } as const;
    if (!(await r.identifiers.retry(ctx.orgId, id, patch))) return err(domainError("INVALID_STATE", "Chỉ gửi lại dòng lô bị từ chối hoặc không phản hồi"));
    return ok({ ...row, ...patch });
  });
  if (!next.ok) return next;
  await deps.queue.enqueue("identifier-send", { orgId: ctx.orgId, userId: ctx.userId, id, attempt: next.value.attempt } satisfies IdentifierSendInput, { jobId: identifierSendJobId(next.value) });
  return ok(undefined);
}

/** "Hỏi kết quả" một dòng theo id (dòng lô không gắn hồ sơ): chờ phản hồi (SENDING / NO_RESPONSE, đã có REF_ID) → hỏi một lượt ngay. */
export async function pollIdentifierById(deps: CustomsDeps, ctx: Ctx, id: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const row = await deps.uow.asOrg(ctx, (r) => r.identifiers.get(ctx.orgId, id));
  if (!row || row.deletedAt) return err(domainError("NOT_FOUND", "Không tìm thấy số định danh"));
  if ((row.status !== "SENDING" && row.status !== "NO_RESPONSE") || !row.refId) return err(domainError("INVALID_STATE", "Không có khai báo định danh đang chờ phản hồi"));
  const polled = await pollIdentifier(deps, { orgId: ctx.orgId, userId: ctx.userId, id, n: 1, manual: true, attempt: row.attempt });
  return polled.ok ? ok(undefined) : polled;
}

/** Worker `identifier-batch-done`: lô không còn dòng SENDING → báo người xin lô (một job mỗi lượt xong – jobId chống trùng ở identifier.ts). */
export async function notifyIdentifierBatchDone(deps: CustomsDeps, input: IdentifierBatchDoneInput): Promise<void> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId("") };
  const rows = (await deps.uow.asOrg(ctx, (r) => r.identifiers.listByBatch(input.orgId, input.batchId))).filter((x) => !x.deletedAt);
  if (!rows.length || rows.some((x) => x.status === "SENDING")) return;
  const count = (s: IdentifierRow["status"]) => rows.filter((x) => x.status === s).length;
  await deps.notify?.notify(input.orgId, { userIds: [rows[0]!.sentBy] }, {
    title: "Đã xin xong lô số định danh",
    body: `Lô ${rows.length} định danh: ${count("ACCEPTED")} có số, ${count("REJECTED")} bị từ chối, ${count("NO_RESPONSE")} chưa phản hồi`,
    href: `/customs/ops?batchId=${encodeURIComponent(input.batchId)}`,
  });
}
