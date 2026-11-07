// GỠ LỖI TẠM (FPT_DEBUG_TRACE): xem trước body IDA/EDA (IDA01/EDA01 sau gọi sửa đổi) từng tờ sẽ gửi FPT – KHÔNG gọi FPT, không đổi trạng thái.
// Dựng bằng đúng hàm của lần truyền thật (sheetOf + buildFptRequest như submitDeclaration/enqueueBranchPreDeclare, chỉ thị CTHQ như processOutbox,
// rồi fptContentBody như FptVnaccsGateway – schema cổng, số tờ khai ở đầu tờ khai IDA01/EDA01). KHÔNG thay guard truyền: BLOCKER luật, HS chưa xác nhận,
// tuần tỷ giá, thứ tự tờ… vẫn chỉ kiểm khi bấm Truyền. Tờ 2..N khi tờ 1 chưa có số: TK_FIC là số giả (cảnh báo). Còn blocker / sai đặc tả / thiếu ô bắt buộc vẫn trả body, kèm danh sách lỗi.
// Tờ chưa thể gửi nội dung (đã khai tạm, đã thông quan…) → không có trong danh sách. Bỏ tính năng: grep FPT_DEBUG_TRACE.
import { branchCount, declarationRequiredGaps, requiredGapsText, type FptPreview, type FptPreviewSheet } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { buildFptRequest } from "../domain/declaration-to-fpt.js";
import { fptContentBody } from "../domain/fpt-content-body.js";
import { stageOf } from "../domain/state-machine.js";
import { CHECK_ONLY_FIRST_NO, contentOpFor, sheetOf } from "./branch-send.js";
import type { CustomsDeps } from "./customs-ports.js";

export async function previewFptPayload(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<FptPreview>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (!deps.fptDebug) return ok({ enabled: false, sheets: [] });
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  const results = await deps.uow.asOrg(ctx, (r) => r.results.listForDossier(ctx.orgId, dossierId));
  const kind = snap.payload.kind;
  const of = branchCount(snap.payload.items.length);
  // Tờ 2..N mang số tờ khai tờ 1 (TK_FIC); tờ 1 chưa có số → số giả CHỈ để dựng (lần truyền thật dựng lại khi có số).
  const firstNo = results.find((r) => r.branch === 1)?.declarationNo ?? null;
  const sheets: FptPreviewSheet[] = [];
  for (let no = 1; no <= of; no++) {
    const result = results.find((r) => r.branch === no);
    const op = contentOpFor(result ? stageOf(result) : "NOT_SENT", kind);
    if (!op) continue;
    const s = sheetOf(snap.payload, no, no === 1 ? null : firstNo ?? CHECK_ONLY_FIRST_NO);
    const built = buildFptRequest(s.payload);
    // IDA01/EDA01: worker ghép chỉ thị Hải quan NGUYÊN VĂN (processOutbox), gateway gắn số tờ khai vào đầu tờ khai – cùng fptContentBody với gửi thật.
    const amend = op === "IDA01" || op === "EDA01";
    const cthq = amend ? result?.raw?.customsInfo?.directivesRaw : undefined;
    const outgoing = cthq ? { ...(built.request as Record<string, unknown>), [`objVN_${kind}_CTHQ`]: cthq } : built.request;
    const body = fptContentBody(kind, outgoing, amend && result?.declarationNo ? { declarationNo: result.declarationNo } : undefined);
    // Schema cổng lỗi → không có body gửi được: hiện bản dựng (trước schema) kèm lỗi.
    const request = body.ok ? body.body : outgoing;
    const schemaIssues = body.ok ? [] : body.issues.map((i) => `${i.field}: ${i.message}`);
    const items = [...s.payload.items].sort((a, b) => a.lineNo - b.lineNo);
    const gaps = declarationRequiredGaps(kind, Object.entries(s.payload.fields).map(([code, f]) => ({ code, value: f.value })), items);
    sheets.push({
      branch: no, of, operation: op, path: `/api/${op}`, request,
      missing: gaps.length ? requiredGapsText(gaps, items.map((i) => i.lineNo)) : null,
      blockers: [...s.blockers, ...built.blockers], issues: [...new Set([...built.issues, ...schemaIssues])],
      warnings: [...(no > 1 && !firstNo ? [`TK_FIC: tờ 1 chưa có số tờ khai – bản xem trước dùng số giả ${CHECK_ONLY_FIRST_NO}; lần gửi thật dùng số Hải quan cấp cho tờ 1`] : []), ...built.warnings],
    });
  }
  return ok({ enabled: true, sheets });
}
