// Chứng từ đã kiểm tra ở bước OCR → bản đọc đã sửa theo người dùng (để skill tự học) + bản đọc mới nhất của chứng từ (để biết đã đọc bằng skill nào).
import type { DocKind } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { applyCorrections, rawPathOf, supplierOf, type Correction } from "../domain/review-learning.js";
import type { ExtractionDeps, ExtractionRow } from "./ports.js";

export type ReviewedDocument = {
  documentId: string; dossierId: string; kind: DocKind; fileName: string; mime: string; pages: number; storageKey: string;
  /** Dữ liệu model đã ghi đè giá trị người dùng sửa. */
  data: Record<string, unknown>;
  corrections: Correction[];
  supplier: string | null;
  skillVersionId: string | null;
};

const latestOf = (rows: ExtractionRow[], documentId: string, kind: DocKind) =>
  rows.filter((x) => x.documentId === documentId && x.kind === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

/** Mọi chứng từ đã đọc xong của hồ sơ kèm bản đọc đã sửa; chứng từ không có lần đọc nào bị bỏ qua. */
export async function reviewedDocuments(deps: ExtractionDeps, ctx: Ctx, dossierId: string): Promise<Result<ReviewedDocument[]>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const docs = (await deps.documents.listForDossier(ctx.orgId, dossierId)).filter((d) => d.status === "DONE");
  const { rows, fields } = await deps.uow.asOrg(ctx, async (r) => ({ rows: await r.extractions.listDone(ctx.orgId, dossierId, docs.map((d) => d.id)), fields: await r.fields.list(ctx.orgId, dossierId) }));
  return ok(
    docs.flatMap((d) => {
      const latest = latestOf(rows, d.id, d.kind);
      if (!latest) return [];
      const { data, corrections } = applyCorrections(d.kind, latest.raw as Record<string, unknown>, fields.filter((f) => f.documentId === d.id));
      return [{ documentId: d.id, dossierId, kind: d.kind, fileName: d.fileName, mime: d.mime, pages: d.pages, storageKey: d.storageKey, data, corrections, supplier: supplierOf(d.kind, data), skillVersionId: latest.skillVersionId }];
    }),
  );
}

export type LatestRead = { documentId: string; skillVersionId: string | null; supplier: string | null };

/** Lần đọc mới nhất của các chứng từ (theo loại hiện tại): đọc bằng phiên bản skill nào, nhà cung cấp nào. Nội bộ – không kiểm quyền. */
export async function latestReads(deps: ExtractionDeps, orgId: string, docs: { documentId: string; dossierId: string; kind: DocKind }[]): Promise<LatestRead[]> {
  if (!docs.length) return [];
  const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
  const rows = await deps.uow.asOrg(ctx, (r) => r.extractions.listDone(orgId, "", docs.map((d) => d.documentId)));
  return docs.flatMap((d) => {
    const latest = latestOf(rows, d.documentId, d.kind);
    return latest ? [{ documentId: d.documentId, skillVersionId: latest.skillVersionId, supplier: supplierOf(d.kind, latest.raw as Record<string, unknown>) }] : [];
  });
}

/** Trường trên màn OCR ↔ chỗ trong dữ liệu model của chứng từ + nhà cung cấp – để gợi ý nhãn cho đúng trường của skill. */
export async function fieldSource(deps: ExtractionDeps, ctx: Ctx, fieldId: string): Promise<Result<{ documentId: string; kind: DocKind; rawPath: string; supplier: string | null } | null>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const f = await deps.uow.asOrg(ctx, (r) => r.fields.get(ctx.orgId, fieldId));
  if (!f) return err(domainError("NOT_FOUND", "Không tìm thấy trường"));
  const doc = await deps.documents.get(ctx.orgId, f.documentId);
  const rawPath = doc && f.shipmentPath ? rawPathOf(doc.kind, f.shipmentPath) : null;
  if (!doc || !rawPath) return ok(null);
  const [read] = await latestReads(deps, ctx.orgId, [{ documentId: doc.id, dossierId: doc.dossierId, kind: doc.kind }]);
  return ok({ documentId: doc.id, kind: doc.kind, rawPath, supplier: read?.supplier ?? null });
}
