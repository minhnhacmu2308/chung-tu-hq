import { createHash } from "node:crypto";
import type { DossierDocument } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, type DomainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canModify } from "../domain/status.js";
import { classifyByFileName, validateUpload } from "../domain/upload-rules.js";
import { toDocument } from "./_dto.js";
import { expandZips } from "./_unzip.js";
import type { DocumentRow, DossierDeps, UploadFile } from "./ports.js";

export const MAX_PAGES_PER_FILE = 60;

/** Upload: kiểm tra từng file (mime, dung lượng, mật khẩu, trang) → quota trang → storage → documents QUEUED → job extract-document. */
export async function uploadDocuments(deps: DossierDeps, ctx: Ctx, dossierId: string, files: UploadFile[]): Promise<Result<DossierDocument[]>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const expanded = await expandZips(files, deps.unzipper);
  if (expanded.length === 0) return err(domainError("FILE_INVALID", "Không có file PDF/ảnh nào để tải lên"));

  // Kiểm tra file trước khi chạm DB.
  const inspected: { f: UploadFile; pages: number; sha256: string }[] = [];
  for (const f of expanded) {
    let info: { pages: number; encrypted: boolean };
    try {
      info = await deps.pdf.inspect(f.bytes, f.mime);
    } catch (e) {
      const de = e as DomainError;
      return err(de && typeof de === "object" && "code" in de ? de : domainError("FILE_INVALID", `${f.name}: không đọc được file`));
    }
    const v = validateUpload({ name: f.name, mime: f.mime, sizeBytes: f.bytes.length, pages: info.pages, encrypted: info.encrypted }, { maxPagesPerFile: MAX_PAGES_PER_FILE });
    if (!v.ok) return v;
    inspected.push({ f, pages: info.pages, sha256: createHash("sha256").update(f.bytes).digest("hex") });
  }

  const created = await deps.uow.asOrg(ctx, async (r) => {
    const d = await r.dossiers.get(ctx.orgId, dossierId);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    const m = canModify(d.status);
    if (!m.ok) return m;
    const existing = await r.documents.list(ctx.orgId, dossierId);
    const totalPages = existing.reduce((n, x) => n + x.pages, 0) + inspected.reduce((n, x) => n + x.pages, 0);
    if (!(await deps.quota.check(ctx.orgId, "PAGES", totalPages))) return err(domainError("QUOTA_EXCEEDED", "Vượt số trang cho một hồ sơ theo gói dịch vụ"));
    const rows: DocumentRow[] = [];
    for (const { f, pages, sha256 } of inspected) {
      const id = deps.idGen.next("doc");
      const ext = f.name.toLowerCase().split(".").pop() ?? "bin";
      const storageKey = `orgs/${ctx.orgId}/dossiers/${dossierId}/${id}/${sha256}.${ext}`;
      await deps.storage.put(storageKey, f.bytes, f.mime);
      const row: DocumentRow = {
        id, orgId: ctx.orgId, dossierId, kind: classifyByFileName(f.name), kindSource: "FILENAME", fileName: f.name, mime: f.mime, sizeBytes: f.bytes.length, pages,
        status: "QUEUED", error: null, storageKey, sha256, uploadedBy: ctx.userId, createdAt: now, updatedAt: now,
      };
      await r.documents.insert(row);
      rows.push(row);
    }
    if (d.status === "DRAFT") await r.dossiers.update(dossierId, { status: "PROCESSING", updatedAt: now });
    else await r.dossiers.update(dossierId, { updatedAt: now });
    return ok(rows);
  });
  if (!created.ok) return created;

  for (const row of created.value) {
    await deps.queue.enqueue("extract-document", { orgId: ctx.orgId, dossierId, documentId: row.id, mode: "FULL", idempotencyKey: `${row.id}:${row.sha256}` }, { jobId: `extract:${row.id}:${row.sha256}` });
    await deps.publisher.publish(ctx.orgId, dossierId, { type: "document.status", documentId: row.id, status: "QUEUED" });
  }
  return ok(created.value.map(toDocument));
}
