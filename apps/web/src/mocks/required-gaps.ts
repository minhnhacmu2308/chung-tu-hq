// Ô bắt buộc còn trống của tờ khai mô phỏng – cùng quy tắc bản in bước Review và backend (@kb/contracts declarationRequiredGaps).
import { declarationRequiredGaps, requiredGapsText } from "@kb/contracts";
import type { MockDb } from "@/mocks/db";
import type { Declaration } from "@/mocks/types";
import { reasonApiError } from "@/mocks/reason-error";

/** Còn ô bắt buộc trống → không cho phê duyệt / khai (`action`: "phê duyệt", "khai"). Cùng mã lý do backend (approve / submit). */
export function assertNoGaps(db: MockDb, decl: Declaration, action: "phê duyệt" | "khai") {
  const items = db.lineItems.filter((i) => i.dossierId === decl.dossierId).sort((a, b) => a.lineNo - b.lineNo);
  const gaps = declarationRequiredGaps(decl.kind, decl.fields, items);
  if (!gaps.length) return;
  const fields = requiredGapsText(gaps, items.map((i) => i.lineNo));
  const reason = action === "khai" ? "REQUIRED_FIELDS_MISSING_SUBMIT" : "REQUIRED_FIELDS_MISSING_APPROVE";
  throw reasonApiError("VALIDATION", reason, { n: gaps.length, fields }, `Chưa ${action} được – còn ${gaps.length} chỉ tiêu bắt buộc chưa nhập: ${fields}`);
}
