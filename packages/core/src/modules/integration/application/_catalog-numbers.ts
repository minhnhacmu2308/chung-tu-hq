// C6 – Hải quan cấp số cho tờ khai nhánh → ghi số tờ khai cuối (+ ngày) lên mặt hàng danh mục của các dòng thuộc tờ đó.
// Gọi SAU khi giao dịch của integration commit (không gọi port module khác trong transaction); lỗi chỉ ghi log – xử lý Hải quan không hỏng vì danh mục.
import { sheetOfLine } from "@kb/contracts";
import type { OrgId } from "../../../shared/ids.js";
import { createLogger } from "../../../shared/log.js";
import type { CustomsDeps } from "./customs-ports.js";

const log = createLogger({ name: "core" });

/**
 * Mặt hàng (không trùng) của các dòng thuộc tờ `branch` (50 dòng/tờ theo thứ tự lineNo – sheetOfLine) → CatalogPort.recordDeclarationNo.
 * `date` = ngày đăng ký Hải quan trả về (YYYY-MM-DD), thiếu thì ngày nhận số. Gọi lại cùng số + ngày không đổi gì (danh mục chỉ ghi khi ngày ≥ ngày đang lưu).
 */
export async function recordCatalogDeclarationNo(deps: Pick<CustomsDeps, "catalog" | "declarations">, orgId: OrgId, dossierId: string, branch: number, declarationNo: string, date: string): Promise<void> {
  const catalog = deps.catalog;
  const read = deps.declarations.lineCatalogItems?.bind(deps.declarations);
  if (!catalog || !read) return;
  let declarationId: string | null = null;
  try {
    const found = await read(orgId, dossierId);
    if (!found) return;
    declarationId = found.declarationId;
    const lineNos = found.lines.map((l) => l.lineNo);
    const itemIds = [...new Set(found.lines.filter((l) => l.catalogItemId && sheetOfLine(lineNos, l.lineNo) === branch).map((l) => l.catalogItemId!))];
    if (itemIds.length) await catalog.recordDeclarationNo(orgId, itemIds.map((itemId) => ({ itemId, declarationNo, date })));
  } catch (e) {
    log.error("integration→catalog: ghi số tờ khai cuối của mặt hàng lỗi", { orgId, dossierId, declarationId, branch, declarationNo, err: e });
  }
}
