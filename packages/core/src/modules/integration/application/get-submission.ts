import { AWAITING_CLEARANCE, branchCount, dossierCustomsSummary, sheetApproved, type CustomsRow, type CustomsSummary, type SubmissionView } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { rowState, stageOf } from "../domain/state-machine.js";
import { CHANNEL_NOTES, startedOf, toSubmissionView, type BranchInput } from "./_customs-view.js";
import type { CustomsDeps, DeclarationSnapshot, ResultRow } from "./customs-ports.js";
import { openAmendmentOf } from "./post-amendment.js";

/** Số tờ hiển thị: theo dòng hàng hiện tại, nhưng không ít hơn số nhánh đã có kết quả (tờ đã có số vẫn tồn tại ở Hải quan). */
const sheetCount = (snap: DeclarationSnapshot | null, results: ResultRow[]) => Math.max(snap ? branchCount(snap.payload.items.length) : 1, ...results.map((r) => r.branch));
const polling = (result: ResultRow | null) => !!result && AWAITING_CLEARANCE.has(stageOf(result)) && result.state !== "SEND_FAILED";

/** Bước Truyền: trạng thái từng tờ khai nhánh (pipeline, thông điệp, kết quả, AMA đã duyệt của tờ); trường cấp hồ sơ = tờ 1. */
export async function getSubmission(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<SubmissionView>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  const { messages, outbox, results, amendments } = await deps.uow.asOrg(ctx, async (r) => ({
    messages: await r.messages.list(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId),
    results: await r.results.listForDossier(ctx.orgId, dossierId), amendments: await r.amendments.listForDossier(ctx.orgId, dossierId),
  }));
  const of = sheetCount(snap, results);
  const hasContainers = (snap?.payload.containers.length ?? 0) > 0;
  const branches = Array.from({ length: of }, (_, i): BranchInput => {
    const no = i + 1;
    const result = results.find((r) => r.branch === no) ?? null;
    // "Đã duyệt" cùng quy tắc với thực hiện nghiệp vụ (sheetApproved): sau thông quan – bản khai bổ sung AMA đang mở của tờ;
    // lô nhiều tờ đang truyền (tờ khai SUBMITTED) – các tờ chờ gửi lại nội dung vẫn là đã duyệt (không trỏ về Review đang khóa).
    const approved = sheetApproved({ stage: stageOf(result), of, declarationStatus: snap?.status ?? null, amendmentStatus: openAmendmentOf(amendments.filter((a) => a.branch === no))?.status ?? null });
    return {
      no, of, flow: { direction: dossier.direction, approved, hasContainers },
      messages: messages.filter((m) => m.branch === no), outbox: outbox.filter((o) => o.branch === no), result, polling: polling(result),
    };
  });
  return ok(toSubmissionView({ declarationStatus: snap?.status ?? "NOT_CREATED", hsUnconfirmed: snap?.unconfirmedHs ?? 0, branches }));
}

/** Màn Khai báo Hải quan: tờ khai đã duyệt / đang / đã truyền của org – mỗi tờ khai nhánh một dòng (các dòng cùng hồ sơ liền nhau). */
export async function listCustomsDeclarations(deps: CustomsDeps, ctx: Ctx): Promise<Result<CustomsRow[]>> {
  const decls = await deps.declarations.listForCustoms(ctx.orgId);
  const results = await deps.uow.asOrg(ctx, (r) => r.results.listForOrg(ctx.orgId));
  const groups: CustomsRow[][] = [];
  for (const d of decls) {
    const dossier = await deps.dossiers.get(ctx.orgId, d.dossierId);
    if (!dossier) continue;
    const own = results.filter((r) => r.dossierId === d.dossierId);
    // Chưa truyền (chưa có kết quả nhánh): số tờ theo dòng hàng của tờ khai.
    const of = own.length ? sheetCount(null, own) : sheetCount(await deps.declarations.get(ctx.orgId, d.dossierId), []);
    const { messages, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ messages: await r.messages.list(ctx.orgId, d.dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, d.dossierId) }));
    const rows = Array.from({ length: of }, (_, i): CustomsRow => {
      const no = i + 1;
      const res = own.find((r) => r.branch === no) ?? null;
      const msgs = messages.filter((m) => m.branch === no);
      const obs = outbox.filter((o) => o.branch === no);
      const last = msgs.at(-1);
      const stage = stageOf(res);
      return {
        dossierId: d.dossierId, dossierCode: dossier.code, branch: no, of, direction: dossier.direction, partner: dossier.partner, typeCode: dossier.typeCode,
        state: rowState(stage, startedOf(msgs, obs, res), obs.some((o) => o.status === "PENDING")), stage,
        updatedAt: (last?.at ?? d.approvedAt ?? dossier.updatedAt).toISOString(),
        ...(last ? { lastOperation: last.operation } : {}),
        ...(res?.declarationNo ? { declarationNo: res.declarationNo } : {}),
        ...(res?.channel ? { channel: res.channel, channelNote: res.channelNote ?? CHANNEL_NOTES[res.channel] } : {}),
        ...(res?.customsTaxVnd ? { customsTaxVnd: res.customsTaxVnd } : {}),
      };
    });
    groups.push(rows);
  }
  // Hồ sơ cập nhật mới nhất trước (theo tờ mới nhất của hồ sơ); trong hồ sơ theo thứ tự tờ.
  const latest = (g: CustomsRow[]) => g.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), "");
  return ok(groups.sort((a, b) => latest(b).localeCompare(latest(a))).flat());
}

/** Tóm tắt Hải quan ("Thông quan k/N", tờ lỗi) cho danh sách / đầu hồ sơ – một truy vấn cho cả trang; hồ sơ chưa truyền không có mục. */
export async function dossierCustomsSummaries(deps: CustomsDeps, ctx: Pick<Ctx, "orgId" | "userId">, dossierIds: string[]): Promise<Result<Map<string, CustomsSummary>>> {
  const out = new Map<string, CustomsSummary>();
  if (!dossierIds.length) return ok(out);
  const results = await deps.uow.asOrg(ctx, (r) => r.results.listForDossiers(ctx.orgId, [...new Set(dossierIds)]));
  for (const id of dossierIds) {
    const own = results.filter((r) => r.dossierId === id).sort((a, b) => a.branch - b.branch);
    if (!own.length || out.has(id)) continue;
    const s = dossierCustomsSummary(own.map((r) => ({ stage: stageOf(r), state: r.state })));
    out.set(id, { of: s.of, cleared: s.cleared, problems: s.problems });
  }
  return ok(out);
}
