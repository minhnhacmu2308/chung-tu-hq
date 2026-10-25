// Phạm vi sửa tờ khai ở bước Review theo các tờ khai nhánh (spec tách tờ khai IDC/gọi về §2.4–2.5) – logic thuần.
// Quy tắc nằm ở @kb/contracts (declarationEditScope / editBlockFor); file này chỉ ghép dữ liệu giao diện vào đó.
import { declarationEditScope, type DeclarationEditScope, type DeclarationStatus, type SubmissionView } from "@kb/contracts";
import { sheetsOf } from "./branch-sheets";

/** Chưa biết giai đoạn truyền (đang tải) → chỉ đọc, tránh mở ô rồi khóa lại. */
export const LOCKED_SCOPE: DeclarationEditScope = { common: "LOCKED", lines: {}, addRemoveLines: false, lockedSheets: [], closedSheets: [] };

/** Phạm vi sửa từ trạng thái tờ khai + mọi tờ khai nhánh; không đọc được giai đoạn (lỗi tải) → coi như chưa khai, backend vẫn chặn theo giai đoạn thật. */
export function editScopeOf(status: DeclarationStatus, submission: SubmissionView | undefined, loading: boolean): DeclarationEditScope {
  if (loading) return LOCKED_SCOPE;
  return declarationEditScope(status, submission ? sheetsOf(submission).map((b) => ({ no: b.no, stage: b.stage, declarationNo: b.declarationNo })) : []);
}

/** Chỉ tiêu chung đổi so với nội dung đã khai ở các tờ còn hiệu lực: 1.51 (TK_TP) cần gọi về tất cả tờ; mã khác → cảnh báo chung. */
export function sentChangeWarnings(submission: SubmissionView | undefined): { totalValue: boolean; otherCommon: string[] } {
  const codes = new Set<string>();
  for (const b of submission?.branches ?? []) for (const c of b.sentChanges?.common ?? []) codes.add(c);
  const totalValue = codes.delete("TK_TP");
  return { totalValue, otherCommon: [...codes] };
}
