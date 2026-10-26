// Nhắc khai HYS trước IDA/EDA (spec khai-hys-truoc-ida §3.3): còn gợi ý chưa thỏa ∧ chưa xác nhận → HYS_SUGGESTED (409); xác nhận (hysWaived) → khai tiếp, ghi NOTE vào nhật ký.
import type { Ctx } from "../../../shared/ctx.js";
import { reasonError } from "../../../shared/errors.js";
import { ok, err, type Result } from "../../../shared/result.js";
import type { CustomsDeps, DeclarationSnapshot } from "./customs-ports.js";
import { pendingHysSuggestions } from "./hys-submissions.js";

export async function hysGuard(
  deps: CustomsDeps, ctx: Pick<Ctx, "orgId" | "userId">, dossierId: string, snap: Pick<DeclarationSnapshot, "payload">, waived: boolean,
): Promise<Result<void>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.hys.list(ctx.orgId, dossierId));
  const codes = pendingHysSuggestions(snap, rows).map((s) => s.code).join(", ");
  if (!codes) return ok(undefined);
  if (!waived) return err(reasonError("INVALID_STATE", "HYS_SUGGESTED", { codes }));
  await deps.uow.asOrg(ctx, (r) => r.messages.insert({
    id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: 1, operation: snap.payload.kind === "IDA" ? "IDA" : "EDA", direction: "NOTE", result: "OK",
    summary: `Người khai xác nhận không khai HYS: ${codes}`, payloadMasked: { codes }, externalRef: null, at: deps.clock.now(),
  }));
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  await deps.orgAudit?.record(ctx, { action: "HYS_WAIVED", targetType: "dossier", targetId: dossierId, targetLabel: dossier?.code ?? dossierId, detail: { codes } });
  return ok(undefined);
}
