import { AWAITING_CLEARANCE, type CustomsRow, type SubmissionView } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { rowState, stageOf } from "../domain/state-machine.js";
import { CHANNEL_NOTES, toSubmissionView } from "./_customs-view.js";
import type { CustomsDeps } from "./customs-ports.js";

export async function getSubmission(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<SubmissionView>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  const { messages, outbox, result } = await deps.uow.asOrg(ctx, async (r) => ({ messages: await r.messages.list(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId), result: await r.results.get(ctx.orgId, dossierId) }));
  const polling = !!result && AWAITING_CLEARANCE.has(stageOf(result)) && result.state !== "SEND_FAILED";
  const flow = { direction: dossier.direction, approved: snap?.status === "APPROVED", hasContainers: (snap?.payload.containers.length ?? 0) > 0 };
  return ok(toSubmissionView({ declarationStatus: snap?.status ?? "NOT_CREATED", hsUnconfirmed: snap?.unconfirmedHs ?? 0, flow, messages, outbox, result, polling }));
}

/** Màn Khai báo Hải quan: tờ khai đã duyệt / đang / đã truyền của org. */
export async function listCustomsDeclarations(deps: CustomsDeps, ctx: Ctx): Promise<Result<CustomsRow[]>> {
  const decls = await deps.declarations.listForCustoms(ctx.orgId);
  const results = await deps.uow.asOrg(ctx, (r) => r.results.listForOrg(ctx.orgId));
  const rows: CustomsRow[] = [];
  for (const d of decls) {
    const dossier = await deps.dossiers.get(ctx.orgId, d.dossierId);
    if (!dossier) continue;
    const res = results.find((r) => r.dossierId === d.dossierId) ?? null;
    const { messages, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ messages: await r.messages.list(ctx.orgId, d.dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, d.dossierId) }));
    const last = messages.at(-1);
    const pending = outbox.some((o) => o.status === "PENDING");
    const stage = stageOf(res);
    rows.push({
      dossierId: d.dossierId, dossierCode: dossier.code, direction: dossier.direction, partner: dossier.partner, typeCode: dossier.typeCode,
      state: rowState(stage, messages.length > 0, pending), stage,
      updatedAt: (last?.at ?? d.approvedAt ?? dossier.updatedAt).toISOString(),
      ...(last ? { lastOperation: last.operation } : {}),
      ...(res?.declarationNo ? { declarationNo: res.declarationNo } : {}),
      ...(res?.channel ? { channel: res.channel, channelNote: res.channelNote ?? CHANNEL_NOTES[res.channel] } : {}),
      ...(res?.customsTaxVnd ? { customsTaxVnd: res.customsTaxVnd } : {}),
    });
  }
  return ok(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}
