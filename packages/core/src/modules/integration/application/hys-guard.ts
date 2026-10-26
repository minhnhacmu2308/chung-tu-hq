// Nhắc khai HYS trước IDA/EDA (spec khai-hys-truoc-ida §3.3): còn gợi ý chưa thỏa ∧ chưa xác nhận → HYS_SUGGESTED (409); xác nhận (hysWaived) → khai tiếp.
// Ghi NOTE "xác nhận không khai HYS" chỉ khi outbox IDA/EDA thật sự được tạo (cùng transaction) – guard sau đó còn trượt thì không có NOTE.
import type { Ctx } from "../../../shared/ctx.js";
import { reasonError } from "../../../shared/errors.js";
import { ok, err, type Result } from "../../../shared/result.js";
import type { CustomsDeps, CustomsRepos, DeclarationSnapshot } from "./customs-ports.js";
import { pendingHysSuggestions } from "./hys-submissions.js";

/** Lần bỏ qua gợi ý HYS cần ghi lại khi outbox được tạo. */
export type HysWaiver = { codes: string; kind: "IDA" | "EDA" };

/** ok(null): không còn gợi ý; ok(waiver): người khai đã xác nhận bỏ qua – ghi bằng `recordHysWaiver` cùng transaction tạo outbox. */
export async function hysGuard(
  deps: CustomsDeps, ctx: Pick<Ctx, "orgId" | "userId">, dossierId: string, snap: Pick<DeclarationSnapshot, "payload">, waived: boolean,
): Promise<Result<HysWaiver | null>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.hys.list(ctx.orgId, dossierId));
  const codes = pendingHysSuggestions(snap, rows).map((s) => s.code).join(", ");
  if (!codes) return ok(null);
  if (!waived) return err(reasonError("INVALID_STATE", "HYS_SUGGESTED", { codes }));
  return ok({ codes, kind: snap.payload.kind === "IDA" ? "IDA" : "EDA" });
}

/** NOTE vào nhật ký thông điệp – gọi trong transaction vừa tạo outbox IDA/EDA. */
export async function recordHysWaiver(deps: CustomsDeps, r: CustomsRepos, ctx: Pick<Ctx, "orgId">, dossierId: string, w: HysWaiver): Promise<void> {
  await r.messages.insert({
    id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: 1, operation: w.kind, direction: "NOTE", result: "OK",
    summary: `Người khai xác nhận không khai HYS: ${w.codes}`, payloadMasked: { codes: w.codes }, externalRef: null, at: deps.clock.now(),
  });
}

/** Nhật ký doanh nghiệp HYS_WAIVED – sau khi transaction tạo outbox đã commit. */
export async function auditHysWaiver(deps: CustomsDeps, ctx: Pick<Ctx, "orgId" | "userId">, dossierId: string, w: HysWaiver): Promise<void> {
  if (!deps.orgAudit) return;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  await deps.orgAudit.record(ctx, { action: "HYS_WAIVED", targetType: "dossier", targetId: dossierId, targetLabel: dossier?.code ?? dossierId, detail: { codes: w.codes } });
}
