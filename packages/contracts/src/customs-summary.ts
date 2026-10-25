// Trạng thái Hải quan gộp của hồ sơ từ các tờ khai nhánh (spec tách tờ khai §6.5) – THUẦN, dùng chung backend (CLEARED khi đủ mọi tờ) và giao diện ("Thông quan k/N").
import type { CustomsStage } from "./customs-flow.js";
import type { SubmissionState } from "./api/customs.js";

export type DossierCustomsSummary = {
  of: number;
  cleared: number;
  /** Tờ bị từ chối / lỗi gửi (số tờ theo thứ tự nhánh, từ 1). */
  problems: { no: number; kind: "REJECTED" | "SEND_FAILED" }[];
  allCleared: boolean;
};

/** Đã thông quan: kể cả đang sửa đổi sau thông quan (AMA – tờ khai gốc vẫn thông quan). */
const CLEARED_STAGES: ReadonlySet<CustomsStage> = new Set(["CLEARED", "POST_EDITING", "POST_PRE_DECLARED", "POST_RECALLED"]);

/** `branches` theo thứ tự nhánh (phần tử i = tờ i+1). Không có nhánh → chưa xong. */
export function dossierCustomsSummary(branches: { stage: CustomsStage; state: SubmissionState }[]): DossierCustomsSummary {
  const cleared = branches.filter((b) => CLEARED_STAGES.has(b.stage)).length;
  const problems = branches.flatMap((b, i): DossierCustomsSummary["problems"] =>
    b.stage === "REJECTED" ? [{ no: i + 1, kind: "REJECTED" }] : b.state === "SEND_FAILED" ? [{ no: i + 1, kind: "SEND_FAILED" }] : []);
  return { of: branches.length, cleared, problems, allCleared: branches.length > 0 && cleared === branches.length };
}

/**
 * Số tờ đã khai (khóa số tờ – luật R-BRANCH-COUNT-LOCKED và guard truyền): khi đã có ít nhất một tờ được cấp số tờ khai, Hải quan đã nhận
 * TK_DNO = số tờ đã lập kết quả (kể cả tờ sau chưa gửi / bị từ chối trước khi có số) → nhánh lớn nhất; chưa tờ nào có số → 0 (chưa khóa).
 */
export function lockedSheetCount(rows: { branch: number; declarationNo: string | null }[]): number {
  return rows.some((r) => !!r.declarationNo) ? Math.max(...rows.map((r) => r.branch)) : 0;
}

/** Số tờ hiện tại (theo dòng hàng) khác số tờ đã khai sau khi có số tờ khai → không truyền (hủy tờ thừa / khai lại trước). */
export const sheetCountChanged = (locked: number, now: number) => locked > 0 && now !== locked;

/**
 * Tờ không còn nhận nội dung tờ khai (đã thông quan, đang sửa sau thông quan, bị Hải quan từ chối) → không bắt gọi về sửa trước khi truyền lại
 * các tờ khác (quyết định R7). Chỉ tiêu chung lệch sau thông quan sửa qua khai bổ sung AMA (Q8).
 */
export const recallExempt = (stage: CustomsStage) => stage === "CLEARED" || stage === "REJECTED" || stage.startsWith("POST_");

/**
 * "Đã duyệt" của một tờ – dùng chung màn Truyền (getSubmission, mock) và thực hiện nghiệp vụ (performOperation).
 * Sau thông quan: bản khai bổ sung AMA đang mở của tờ. Trước đó: tờ khai APPROVED; lô nhiều tờ còn nhận SUBMITTED (nội dung đã duyệt đang truyền lần lượt).
 */
export function sheetApproved(p: { stage: CustomsStage; of: number; declarationStatus: string | null | undefined; amendmentStatus?: string | null }): boolean {
  if (p.stage.startsWith("POST_")) return p.amendmentStatus === "APPROVED";
  return p.declarationStatus === "APPROVED" || (p.of > 1 && p.declarationStatus === "SUBMITTED");
}
