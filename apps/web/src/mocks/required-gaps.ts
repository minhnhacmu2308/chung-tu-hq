// Ô bắt buộc còn trống của tờ khai mô phỏng – cùng quy tắc bản in bước Review và backend (@kb/contracts declarationRequiredGaps).
import { declarationRequiredGaps, requiredGapsText } from "@kb/contracts";
import { ApiError } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import type { Declaration } from "@/mocks/types";

/** Còn ô bắt buộc trống → không cho phê duyệt / khai (`action`: "phê duyệt", "khai"). */
export function assertNoGaps(db: MockDb, decl: Declaration, action: string) {
  const items = db.lineItems.filter((i) => i.dossierId === decl.dossierId).sort((a, b) => a.lineNo - b.lineNo);
  const gaps = declarationRequiredGaps(decl.kind, decl.fields, items);
  if (gaps.length) throw new ApiError("VALIDATION", `Chưa ${action} được – còn ${gaps.length} chỉ tiêu bắt buộc chưa nhập: ${requiredGapsText(gaps, items.map((i) => i.lineNo))}`);
}
