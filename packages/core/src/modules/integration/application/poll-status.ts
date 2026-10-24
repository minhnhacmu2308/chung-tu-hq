// Worker `customs-poll`: sau khai chính thức (IDC/IDE), hỏi trạng thái (IID nhập / IEX xuất) tới khi thông quan/từ chối; ghi IN khi đổi; lặp theo delay.
// Lô nhiều tờ: mỗi tờ khai nhánh hỏi riêng (payload `branch`, vắng = 1); hồ sơ CLEARED khi mọi tờ thông quan (syncDossierClearance).
import { AWAITING_CLEARANCE, dossierCustomsSummary, queryOpFor, type DossierCustomsSummary } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId, type OrgId, type UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { mergeCustomsInfo } from "../domain/customs-info.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import type { CustomsDeps } from "./customs-ports.js";

/** `branch`: tờ khai nhánh (vắng = 1 – job tạo trước khi tách tờ khai). */
export type PollStatusInput = { orgId: string; userId: string; dossierId: string; attempt: number; branch?: number | undefined };
export const MAX_POLLS = 200;

/**
 * Trạng thái hồ sơ gộp từ mọi tờ khai nhánh (spec §6.5): mọi tờ thông quan → hồ sơ CLEARED (không thêm giá trị trạng thái hồ sơ).
 * Gọi sau mỗi lần một tờ có thể vừa thông quan (hỏi trạng thái, tra cứu, AMC). Lô một tờ: như trước.
 */
export async function syncDossierClearance(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string): Promise<DossierCustomsSummary> {
  const results = await deps.uow.asOrg(ctx, (r) => r.results.listForDossier(ctx.orgId, dossierId));
  const summary = dossierCustomsSummary(results.map((r) => ({ stage: stageOf(r), state: r.state })));
  if (summary.allCleared) await deps.dossiers.update(ctx.orgId, dossierId, { status: "CLEARED" });
  return summary;
}

export async function pollStatus(deps: CustomsDeps, input: PollStatusInput): Promise<Result<{ done: boolean; cleared: boolean }>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const branch = input.branch ?? 1;
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(input.orgId, input.dossierId, branch));
  if (!result) return err(domainError("NOT_FOUND", "Hồ sơ chưa truyền"));
  const stage = stageOf(result);
  if (!result.externalId || !AWAITING_CLEARANCE.has(stage)) return ok({ done: true, cleared: stage === "CLEARED" });
  const dossier = await deps.dossiers.get(input.orgId, input.dossierId);
  const op = queryOpFor(dossier?.direction ?? "NK");

  const st = await deps.gateway.queryStatus(input.orgId, result.externalId, input.dossierId);
  await meterSafely(deps.usage, { orgId: input.orgId, dossierId: input.dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: op, quantity: 1, meta: { attempt: input.attempt } });
  const nextStage = st.rejected ? "REJECTED" : st.cleared ? "CLEARED" : stage;
  const now = deps.clock.now();
  const changed = st.status !== result.raw?.lastStatus;
  await deps.uow.asOrg(ctx, async (r) => {
    if (changed) {
      await r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: input.dossierId, branch, operation: op, direction: "IN", result: "OK", summary: `Trạng thái tờ khai: ${st.status}`, payloadMasked: { nghiepVu: op, soToKhai: st.declarationNo ?? result.declarationNo, trangThai: st.status, phanLuong: st.channel }, externalRef: result.externalId, at: now });
    }
    await r.results.upsert({
      ...result, state: coarseState(nextStage, result.state === "SEND_FAILED" && nextStage === stage), pollCount: result.pollCount + 1,
      clearanceStatus: st.rejected ? "REJECTED" : st.cleared ? "CLEARED" : "INSPECTING",
      ...(st.customsTaxVnd ? { customsTaxVnd: st.customsTaxVnd } : {}), ...(st.declarationNo ? { declarationNo: st.declarationNo } : {}), ...(st.channel ? { channel: st.channel } : {}),
      raw: { ...(result.raw ?? {}), stage: nextStage, lastStatus: st.status, ...(st.info ? { customsInfo: mergeCustomsInfo(result.raw?.customsInfo, { ...st.info, receivedAt: now.toISOString() }) } : {}) }, updatedAt: now,
    });
  });
  if (st.cleared) {
    const summary = await syncDossierClearance(deps, ctx, input.dossierId);
    // Mỗi tờ báo một lần (tờ đã thông quan không còn hỏi trạng thái); lô nhiều tờ ghi rõ "Tờ k/N".
    const sheet = summary.of > 1 ? ` – Tờ ${branch}/${summary.of}` : "";
    await deps.notify?.notify(input.orgId, { dossierOwnerOf: input.dossierId, roles: ["APPROVER"] }, { title: `${dossier?.code ?? "Hồ sơ"}${sheet} đã thông quan`, body: `Số tờ khai ${st.declarationNo ?? result.declarationNo ?? ""} – ${st.status}.`, href: `/dossiers/${input.dossierId}?step=submit` });
  }
  if (changed || st.cleared) await deps.dossiers.publish(input.orgId, input.dossierId, { type: "customs.message" });
  const done = st.cleared || !!st.rejected || input.attempt >= MAX_POLLS;
  if (!done) await deps.queue.enqueue("customs-poll", { ...input, attempt: input.attempt + 1 }, { jobId: `customs-poll:${input.dossierId}:${now.getTime()}:${input.attempt + 1}${branch > 1 ? `:b${branch}` : ""}`, delayMs: deps.pollDelayMs });
  return ok({ done, cleared: st.cleared });
}
