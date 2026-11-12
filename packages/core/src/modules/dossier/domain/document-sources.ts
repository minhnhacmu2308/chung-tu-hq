// Nguồn chứng từ của hồ sơ (ADR 0013 GĐ1): chứng từ nào "có sau khi khai". Thuần.
import { canBeIssued, canBePending, type DocKind, type DocumentSources } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

export { defaultDocumentSources } from "@kb/contracts";

/** Gộp thay đổi vào nguồn hiện có. `UPLOADED` = bỏ đánh dấu (không lưu – vắng là tải lên). Chỉ hồ sơ xuất: B/L, AWB, C/O có sau khi khai; Invoice, PL hệ thống phát hành. */
export function mergeDocumentSources(direction: "NK" | "XK", current: DocumentSources, patch: DocumentSources): Result<DocumentSources> {
  const next: DocumentSources = { ...current };
  for (const [k, v] of Object.entries(patch) as [DocKind, DocumentSources[DocKind]][]) {
    if (v === "PENDING_AFTER_DECLARATION") {
      if (!canBePending(direction, k)) return err(domainError("VALIDATION", `Chứng từ ${k} không đánh dấu "có sau khi khai" được – chỉ vận đơn, AWB, C/O của hồ sơ xuất khẩu`));
      next[k] = v;
    } else if (v === "ISSUED") {
      if (!canBeIssued(direction, k)) return err(domainError("VALIDATION", `Chứng từ ${k} không do hệ thống phát hành được – chỉ Invoice, Packing List của hồ sơ xuất khẩu`));
      next[k] = v;
    } else delete next[k];
  }
  return ok(next);
}
