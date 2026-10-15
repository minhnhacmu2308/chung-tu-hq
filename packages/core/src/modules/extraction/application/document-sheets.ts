// Bảng đọc theo từng chứng từ (STT | Tên trường | Trị giá) theo danh mục trường chuẩn + trường bổ sung của doanh nghiệp.
// Giá trị là kết quả AI đọc của chính chứng từ đó; sửa tay của người dùng nằm ở màn kiểm tra và tờ khai.
import type { DocKind, DocumentSheet } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { buildDocumentSheet } from "../domain/document-sheet.js";
import type { ExtractionDeps } from "./ports.js";

export async function documentSheets(deps: ExtractionDeps, ctx: Ctx, dossierId: string): Promise<Result<DocumentSheet[]>> {
  const docs = (await deps.documents.listForDossier(ctx.orgId, dossierId)).filter((d) => d.status === "DONE");
  if (!docs.length) return ok([]);
  const rows = await deps.uow.asOrg(ctx, (r) => r.extractions.listDone(dossierId, docs.map((d) => d.id)));
  const labels = new Map<DocKind, Record<string, string>>();
  const out: DocumentSheet[] = [];
  for (const d of docs) {
    const latest = rows.filter((x) => x.documentId === d.id && x.kind === d.kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!latest) continue;
    if (!labels.has(d.kind)) labels.set(d.kind, Object.fromEntries((await deps.skills.resolve(ctx.orgId, d.kind, null)).customFields.map((f) => [f.key, f.label])));
    out.push({ documentId: d.id, fileName: d.fileName, kind: d.kind, rows: buildDocumentSheet(d.kind, latest.raw as Record<string, unknown>, labels.get(d.kind)) });
  }
  return ok(out);
}
