// Phạm vi sửa dữ liệu chứng từ theo tờ đã gọi về (spec tách tờ khai IDC/gọi về §2.4) – cùng quy tắc với module declaration (contracts editBlockFor).
// Lô một tờ / chưa nối port → không kiểm (hành vi cũ). Chỉ tiêu chung khóa: chỉ ô dòng hàng (khóa ô `item.<lineNo>.<ô>`, projectFields) của dòng thuộc
// tờ sửa được mới sửa được; trường header, hoặc không xác định được dòng → coi là chỉ tiêu chung.
import { declarationEditScope, editBlockFor, sheetOfLine, type EditTarget } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { reasonError, type DomainError } from "../../../shared/errors.js";
import type { ExtractionDeps } from "./ports.js";

const ITEM_KEY = /^item\.(\d+)\./;

/** `fieldKey`: khóa trường trích xuất; null = thao tác cả hồ sơ (xác nhận dữ liệu) – chỉ tiêu chung. */
export async function sheetScopeError(deps: ExtractionDeps, ctx: Ctx, dossierId: string, fieldKey: string | null): Promise<DomainError | null> {
  const sheets = deps.customsSheets ? await deps.customsSheets(ctx.orgId, dossierId) : [];
  if (sheets.length <= 1) return null;
  // Hồ sơ không khóa đọc (đã kiểm trước) → tờ khai đang nháp.
  const scope = declarationEditScope("DRAFT", sheets);
  let target: EditTarget = { kind: "COMMON" };
  const m = fieldKey ? ITEM_KEY.exec(fieldKey) : null;
  if (m) {
    const lineNo = Number(m[1]);
    const shipment = await deps.uow.asOrg(ctx, (r) => r.shipments.latest(ctx.orgId, dossierId));
    const lineNos = shipment?.data.items.map((i) => i.lineNo) ?? [];
    if (lineNos.includes(lineNo)) target = { kind: "LINE", sheet: sheetOfLine(lineNos, lineNo) };
  }
  const b = editBlockFor(scope, target);
  return b && b.reasonCode !== "DECLARATION_LOCKED" ? reasonError("INVALID_STATE", b.reasonCode, b.params) : null;
}
