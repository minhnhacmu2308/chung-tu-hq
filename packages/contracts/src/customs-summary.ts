// Trạng thái Hải quan gộp của hồ sơ từ các tờ khai nhánh (spec tách tờ khai §6.5) – THUẦN, dùng chung backend (CLEARED khi đủ mọi tờ) và giao diện ("Thông quan k/N").
import type { CustomsStage } from "./customs-flow.js";
import { baseOp, isContentOperation } from "./customs-flow.js";
import type { CustomsOperation } from "./dto/customs.js";
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

/** Tờ còn chờ gửi nội dung tờ khai ở lần truyền này: chưa gửi lần nào, đã gọi về (IDB), đã gọi sửa đổi (IDD). */
export const awaitingContent = (stage: CustomsStage) => stage === "NOT_SENT" || stage === "RECALLED" || stage === "AMEND_RECALLED";

/**
 * Thứ tự truyền tờ khai nhánh (spec §6.2/§6.4 – luôn gửi Hải quan theo thứ tự tờ): tờ `no` chỉ nhận nội dung (IDA/IDA01/EDA/EDA01) khi mọi tờ
 * trước còn nhận nội dung đã được gửi ở lần truyền này. Trả tờ trước gần nhất còn chờ gửi (awaitingContent) → tờ `no` chờ tờ đó; null = được gửi.
 * Tờ đã thông quan / sửa sau thông quan / bị từ chối không chờ (R7 – không nhận nội dung nữa). Dùng chung backend, giao diện ("Chờ tờ j") và mock.
 */
export function sheetOrderWait(sheets: { no: number; stage: CustomsStage }[], no: number): number | null {
  const before = sheets.filter((s) => s.no < no && awaitingContent(s.stage)).map((s) => s.no);
  return before.length ? Math.max(...before) : null;
}

/**
 * Nghiệp vụ truyền theo thứ tự tờ (lô nhiều tờ): CONTENT = gửi nội dung (IDA/IDA01/EDA/EDA01), DECLARE = khai chính thức (IDC/IDE/EDC/EDE, theo baseOp).
 * Cả hai chờ cùng điều kiện sheetOrderWait (mọi tờ trước đã khai tạm xong; không bắt tờ trước đã khai chính thức). Khác (gọi về, AMA…, tra cứu) → null.
 */
export function orderedOperation(op: CustomsOperation): "CONTENT" | "DECLARE" | null {
  if (op === "AMA") return null;
  if (isContentOperation(op)) return "CONTENT";
  const b = baseOp(op);
  return b === "IDC" || b === "IDE" ? "DECLARE" : null;
}
