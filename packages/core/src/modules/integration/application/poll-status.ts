// Worker `customs-poll`: hỏi trạng thái (IEX) tới khi thông quan/từ chối; ghi IN khi đổi; lặp theo delay.
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { next, TERMINAL } from "../domain/state-machine.js";
import type { CustomsDeps } from "./customs-ports.js";

export type PollStatusInput = { orgId: string; userId: string; dossierId: string; attempt: number };
export const MAX_POLLS = 200;

export async function pollStatus(deps: CustomsDeps, input: PollStatusInput): Promise<Result<{ done: boolean; cleared: boolean }>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(input.orgId, input.dossierId));
  if (!result) return err(domainError("NOT_FOUND", "Hồ sơ chưa truyền"));
  if (TERMINAL.has(result.state) || !result.externalId) return ok({ done: true, cleared: result.state === "CLEARED" });
  const progress = result.raw?.progress ?? "APPROVED";
  if (progress !== "DOCS_SENT" && progress !== "DONE") return ok({ done: true, cleared: false });

  const st = await deps.gateway.queryStatus(input.orgId, result.externalId, input.dossierId);
  const transition = next(result.state, progress, { type: "STATUS", cleared: st.cleared, ...(st.rejected ? { rejected: true } : {}) });
  const now = deps.clock.now();
  const changed = st.status !== result.raw?.lastStatus;
  await deps.uow.asOrg(ctx, async (r) => {
    if (changed) {
      await r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: input.dossierId, operation: "IEX", direction: "IN", result: "OK", summary: `Trạng thái tờ khai: ${st.status}`, payloadMasked: { nghiepVu: "IEX", soToKhai: st.declarationNo ?? result.declarationNo, trangThai: st.status, phanLuong: st.channel }, externalRef: result.externalId, at: now });
    }
    await r.results.upsert({
      ...result, state: transition?.state ?? result.state, pollCount: result.pollCount + 1,
      clearanceStatus: st.rejected ? "REJECTED" : st.cleared ? "CLEARED" : "INSPECTING",
      ...(st.customsTaxVnd ? { customsTaxVnd: st.customsTaxVnd } : {}), ...(st.declarationNo ? { declarationNo: st.declarationNo } : {}), ...(st.channel ? { channel: st.channel } : {}),
      raw: { ...(result.raw ?? { progress: "DOCS_SENT" as const }), progress: transition?.progress ?? progress, lastStatus: st.status }, updatedAt: now,
    });
  });
  if (st.cleared) {
    await deps.dossiers.update(input.orgId, input.dossierId, { status: "CLEARED" });
    const d = await deps.dossiers.get(input.orgId, input.dossierId);
    await deps.notify?.notify(input.orgId, { dossierOwnerOf: input.dossierId, roles: ["APPROVER"] }, { title: `${d?.code ?? "Hồ sơ"} đã thông quan`, body: `Số tờ khai ${st.declarationNo ?? result.declarationNo ?? ""} – ${st.status}.`, href: `/dossiers/${input.dossierId}?step=submit` });
  }
  if (changed || st.cleared) await deps.dossiers.publish(input.orgId, input.dossierId, { type: "customs.message" });
  const done = st.cleared || !!st.rejected || input.attempt >= MAX_POLLS;
  if (!done) await deps.queue.enqueue("customs-poll", { ...input, attempt: input.attempt + 1 }, { jobId: `customs-poll:${input.dossierId}:${input.attempt + 1}`, delayMs: deps.pollDelayMs });
  return ok({ done, cleared: st.cleared });
}
