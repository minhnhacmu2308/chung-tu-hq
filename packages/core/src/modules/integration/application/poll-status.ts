// Worker `customs-poll`: sau khai chính thức (IDC/IDE), hỏi trạng thái (IID nhập / IEX xuất) tới khi thông quan/từ chối; ghi IN khi đổi; lặp theo delay.
import { AWAITING_CLEARANCE, queryOpFor } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import type { CustomsDeps } from "./customs-ports.js";

export type PollStatusInput = { orgId: string; userId: string; dossierId: string; attempt: number };
export const MAX_POLLS = 200;

export async function pollStatus(deps: CustomsDeps, input: PollStatusInput): Promise<Result<{ done: boolean; cleared: boolean }>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(input.orgId, input.dossierId));
  if (!result) return err(domainError("NOT_FOUND", "Hồ sơ chưa truyền"));
  const stage = stageOf(result);
  if (!result.externalId || !AWAITING_CLEARANCE.has(stage)) return ok({ done: true, cleared: stage === "CLEARED" });
  const dossier = await deps.dossiers.get(input.orgId, input.dossierId);
  const op = queryOpFor(dossier?.direction ?? "NK");

  const st = await deps.gateway.queryStatus(input.orgId, result.externalId, input.dossierId);
  const nextStage = st.rejected ? "REJECTED" : st.cleared ? "CLEARED" : stage;
  const now = deps.clock.now();
  const changed = st.status !== result.raw?.lastStatus;
  await deps.uow.asOrg(ctx, async (r) => {
    if (changed) {
      await r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: input.dossierId, operation: op, direction: "IN", result: "OK", summary: `Trạng thái tờ khai: ${st.status}`, payloadMasked: { nghiepVu: op, soToKhai: st.declarationNo ?? result.declarationNo, trangThai: st.status, phanLuong: st.channel }, externalRef: result.externalId, at: now });
    }
    await r.results.upsert({
      ...result, state: coarseState(nextStage, result.state === "SEND_FAILED" && nextStage === stage), pollCount: result.pollCount + 1,
      clearanceStatus: st.rejected ? "REJECTED" : st.cleared ? "CLEARED" : "INSPECTING",
      ...(st.customsTaxVnd ? { customsTaxVnd: st.customsTaxVnd } : {}), ...(st.declarationNo ? { declarationNo: st.declarationNo } : {}), ...(st.channel ? { channel: st.channel } : {}),
      raw: { ...(result.raw ?? {}), stage: nextStage, lastStatus: st.status }, updatedAt: now,
    });
  });
  if (st.cleared) {
    await deps.dossiers.update(input.orgId, input.dossierId, { status: "CLEARED" });
    await deps.notify?.notify(input.orgId, { dossierOwnerOf: input.dossierId, roles: ["APPROVER"] }, { title: `${dossier?.code ?? "Hồ sơ"} đã thông quan`, body: `Số tờ khai ${st.declarationNo ?? result.declarationNo ?? ""} – ${st.status}.`, href: `/dossiers/${input.dossierId}?step=submit` });
  }
  if (changed || st.cleared) await deps.dossiers.publish(input.orgId, input.dossierId, { type: "customs.message" });
  const done = st.cleared || !!st.rejected || input.attempt >= MAX_POLLS;
  if (!done) await deps.queue.enqueue("customs-poll", { ...input, attempt: input.attempt + 1 }, { jobId: `customs-poll:${input.dossierId}:${now.getTime()}:${input.attempt + 1}`, delayMs: deps.pollDelayMs });
  return ok({ done, cleared: st.cleared });
}
