import { runMatch, type CatalogDeps } from "@kb/core/modules/catalog";
import { asOrgId, asUserId, createLogger } from "@kb/core/shared";
import { z } from "zod";
import { parsePayload } from "./_payload.js";

const log = createLogger({ name: "worker" });

export const CatalogImportPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), importId: z.string().min(1) });

/**
 * Nhập danh mục > 500 dòng (spec §4): ghép các dòng đã lưu tạm của lần nhập theo lô. Idempotent – lần nhập đã DONE trả lại ngay,
 * chạy lại giữa chừng tiếp từ `rows_done`. Lỗi DB tạm ném ra để BullMQ retry; hết lượt → onFinalFailure đánh dấu FAILED.
 */
export async function catalogImportJob(deps: CatalogDeps, raw: unknown, run: typeof runMatch = runMatch) {
  const p = parsePayload(CatalogImportPayload, raw, "catalog-import");
  const r = await run(deps, { orgId: asOrgId(p.orgId), userId: asUserId(p.userId) }, p.importId);
  if (!r.ok) {
    log.warn("use case trả lỗi nghiệp vụ", { queue: "catalog-import", orgId: p.orgId, importId: p.importId, code: r.error.code, message: r.error.message });
    return r.error.code;
  }
  return { status: r.value.status, ...r.value.counts };
}
