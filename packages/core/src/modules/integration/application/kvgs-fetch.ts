// Lấy danh sách container qua khu vực giám sát (ADR 0014, spec §2.3): bản mới SENDING + outbox KVGS `kvgs:<rowId>` + job customs-send.
import type { KvgsView } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { CustomsDeps, KvgsSheetRecord, OutboxRow } from "./customs-ports.js";
import { isDuplicate, buildView, checkOperation, KVGS_ROLES, loadScope, preload } from "./kvgs.js";


/**
 * Yêu cầu lấy bảng kê KVGS. Đang SENDING → KVGS_ALREADY_SENDING (không tạo outbox thứ hai); chưa thông quan / NK container chưa được chấp nhận danh sách
 * → lý do tương ứng (customs-flow). Loại hàng (container / hàng lẻ) do API KVGS trả về, không gửi đi.
 */
export async function requestKvgsFetch(deps: CustomsDeps, ctx: Ctx, dossierId: string, branch: number): Promise<Result<KvgsView>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const pre = await preload(deps, ctx, dossierId);
  if (!pre.ok) return pre;
  const { dossier, snap } = pre.value;
  const sent = await deps.uow.asOrg(ctx, async (r) => {
    const scope = await loadScope(ctx, dossier, branch, r);
    if (!scope.ok) return scope;
    const cur = await r.kvgs.latest(ctx.orgId, dossierId, branch);
    if (cur?.status === "SENDING") return err(reasonError("INVALID_STATE", "KVGS_ALREADY_SENDING"));
    const blocked = await checkOperation(r, ctx, scope.value, "KVGS");
    if (blocked) return err(blocked);
    if (!snap) return err(domainError("NO_DECLARATION", "Chưa dựng tờ khai"));
    const now = deps.clock.now();
    const row: KvgsSheetRecord = { id: deps.idGen.next("kvg"), orgId: ctx.orgId, dossierId, branch, status: "SENDING", refId: null, receiptNo: null, receiptDate: null, errors: null, sheet: null, raw: null, requestedBy: ctx.userId, requestedAt: now, fetchedAt: null, createdAt: now, updatedAt: now };
    const outbox: OutboxRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch, declarationId: snap.declarationId, operation: "KVGS", idempotencyKey: `kvgs:${row.id}`, payload: { kvgsId: row.id }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now };
    try {
      await r.kvgs.insert(row);
      await r.outbox.insert(outbox);
    } catch (e) {
      if (isDuplicate(e)) return err(reasonError("INVALID_STATE", "KVGS_ALREADY_SENDING"));
      throw e;
    }
    return ok({ outboxId: outbox.id, scope: scope.value });
  });
  if (!sent.ok) return sent;
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: sent.value.outboxId }, { jobId: `customs-send:${sent.value.outboxId}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return deps.uow.asOrg(ctx, async (r) => ok(await buildView(ctx, snap, sent.value.scope, r, await r.containerLists.latest(ctx.orgId, dossierId, branch), null)));
}
