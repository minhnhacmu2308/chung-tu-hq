// Đọc khóa dòng (getForUpdate) + ghi trong một giao dịch: chỉ lần thực sự chuyển sang CANCELLED mới ghi thông điệp / audit / thông báo.
// Ghi nhận Hải quan đã hủy tờ khai (VNACCS không có thông điệp hủy – spec trạng thái hồ sơ §6): người duyệt/quản trị xác nhận lý do + ngày,
// tờ chuyển giai đoạn CANCELLED (cuối). Chỉ tờ đã có số, chưa thông quan, chưa bị từ chối. Gọi lại khi tờ đã CANCELLED: ok, không ghi thêm.
import { loadCodeList, queryOpFor, type ConfirmCancelledInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import { syncDossierClearance } from "./_clearance.js";
import type { CustomsDeps } from "./customs-ports.js";

export async function confirmDeclarationCancelled(deps: CustomsDeps, ctx: Ctx, dossierId: string, input: ConfirmCancelledInput): Promise<Result<void>> {
  const allowed = requireRole(ctx, "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const reasons = await loadCodeList("CANCEL_REASON");
  if (!reasons.some((x) => x.code === input.reason)) return err(domainError("VALIDATION", `Lý do hủy không có trong danh mục: ${input.reason}`));
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  // Hồ sơ đã hủy: không ghi nhận hủy tờ khai nữa.
  if (dossier.status === "CANCELLED") return err(reasonError("INVALID_STATE", "CANCEL_NOT_ALLOWED"));
  const now = deps.clock.now();
  const outcome = await deps.uow.asOrg(ctx, async (r): Promise<Result<{ declarationNo: string } | null>> => {
    const row = await r.results.getForUpdate(ctx.orgId, dossierId, input.branch);
    if (!row) return err(domainError("NOT_FOUND", "Không tìm thấy tờ khai"));
    const stage = stageOf(row);
    if (stage === "CANCELLED") return ok(null);
    // Còn lệnh đang gửi cho tờ này: kết quả về muộn có thể ghi đè – chờ xong rồi mới ghi nhận hủy.
    const outbox = await r.outbox.listForDossier(ctx.orgId, dossierId);
    if (outbox.some((o) => o.branch === input.branch && o.status === "PENDING")) return err(reasonError("INVALID_STATE", "DECLARATION_SENDING"));
    if (!row.declarationNo || stage === "NOT_SENT" || stage === "CLEARED" || stage.startsWith("POST_") || stage === "REJECTED" || row.state === "CLEARED" || row.state === "REJECTED") {
      return err(reasonError("INVALID_STATE", "CANCEL_NOT_ALLOWED"));
    }
    const cancellation = { reason: input.reason, date: input.date, ...(input.docNo ? { docNo: input.docNo } : {}), ...(input.note ? { note: input.note } : {}), by: String(ctx.userId), at: now.toISOString() };
    await r.results.upsert({ ...row, state: coarseState("CANCELLED"), raw: { ...(row.raw ?? {}), stage: "CANCELLED", cancellation }, updatedAt: now });
    await r.messages.insert({
      id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: input.branch, operation: queryOpFor(dossier.direction), direction: "IN", result: "OK",
      summary: `Người khai xác nhận tờ khai ${row.declarationNo} đã hủy – lý do ${input.reason}`, payloadMasked: { declarationNo: row.declarationNo, ...cancellation }, externalRef: null, at: now,
    });
    return ok({ declarationNo: row.declarationNo });
  });
  if (!outcome.ok) return outcome;
  // Đã hủy từ trước (gọi lại / đồng thời): không ghi audit, thông báo lần nữa – chỉ đồng bộ trạng thái hồ sơ (idempotent; bù khi lần đầu chết sau commit).
  if (!outcome.value) {
    await syncDossierClearance(deps, ctx, dossierId);
    return ok(undefined);
  }
  // Tab khác đang mở hồ sơ làm mới (giống các lần ghi kết quả Hải quan khác).
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  const { declarationNo } = outcome.value;
  await deps.orgAudit?.record(ctx, { action: "DECLARATION_CANCEL_CONFIRMED", targetType: "dossier", targetId: dossierId, targetLabel: dossier.code, detail: { branch: input.branch, declarationNo, reason: input.reason, date: input.date } });
  await syncDossierClearance(deps, ctx, dossierId);
  await deps.notify?.notify(ctx.orgId, { dossierOwnerOf: dossierId }, { title: `${dossier.code}: tờ khai đã hủy`, body: `Số tờ khai ${declarationNo} – lý do hủy ${input.reason}.`, href: `/dossiers/${dossierId}?step=submit` });
  return ok(undefined);
}
