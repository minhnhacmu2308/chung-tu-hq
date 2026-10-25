// Tờ khai nhánh (lô > 50 dòng → N tờ, spec tách tờ khai §6.5/§8) trên bước Khai báo / Sửa sau thông quan – logic thuần, test bằng vitest.
// SubmissionView: trường cấp hồ sơ = tờ 1 (tương thích), `branches` mọi tờ; JSON cũ không có `branches` → coi như lô 1 tờ.
import type { BranchSubmission, SubmissionView } from "@/api/customs";
import { postStepVisible } from "../../post-amendment/ama-wizard";

/** Các tờ của lô theo thứ tự; không có `branches` → một tờ dựng từ trường cấp hồ sơ. */
export function sheetsOf(s: SubmissionView): BranchSubmission[] {
  if (s.branches.length) return s.branches;
  return [{
    no: 1, of: 1, stage: s.stage, state: "APPROVED", declarationNo: s.result?.declarationNo ?? null, channel: s.result?.channel ?? null,
    pipeline: s.pipeline, nextOp: s.nextOp, queryOp: s.queryOp, amendments: s.amendments, postAmendments: s.postAmendments, messages: s.messages,
    result: s.result, customsInfo: s.customsInfo, rejection: s.rejection, inProgress: s.inProgress, started: s.started,
  }];
}

/** SubmissionView nhìn theo tờ `no`: trường cấp hồ sơ thay bằng của tờ đó (tờ 1 / lô 1 tờ → nguyên `s`). */
export function sheetView(s: SubmissionView, no: number): SubmissionView {
  const b = no === 1 ? undefined : s.branches[no - 1];
  if (!b) return s;
  return {
    ...s,
    stage: b.stage, nextOp: b.nextOp, queryOp: b.queryOp, amendments: b.amendments, postAmendments: b.postAmendments, pipeline: b.pipeline,
    messages: b.messages, result: b.result, customsInfo: b.customsInfo, rejection: b.rejection, inProgress: b.inProgress, started: b.started,
  };
}

/** Giai đoạn tờ còn chờ gửi nội dung tờ khai (lần đầu / sau gọi về / sau gọi sửa đổi). */
const AWAITING_CONTENT: ReadonlySet<string> = new Set(["NOT_SENT", "RECALLED", "AMEND_RECALLED"]);

/**
 * Tờ đang chờ tờ nào (nhãn "Chờ tờ j"), tờ không đang gửi:
 * - khai tạm nối tiếp (§6.2): tờ chưa gửi mà tờ ngay trước chưa có số tờ khai → chờ tờ đó;
 * - truyền lại sau gọi về (§6.4, tờ khai SUBMITTED – lần truyền đang chạy): tờ còn chờ gửi nội dung chờ tờ trước gần nhất cũng còn chờ gửi
 *   (worker gửi lần lượt; tờ đã thông quan / bị từ chối không chờ).
 */
export function waitingOn(sheets: BranchSubmission[], no: number, declarationStatus?: string): number | null {
  const b = sheets[no - 1];
  const prev = sheets[no - 2];
  if (!b || !prev || b.pipeline.some((r) => r.status === "SENDING")) return null;
  if (b.stage === "NOT_SENT" && !prev.declarationNo) return prev.no;
  if (declarationStatus !== "SUBMITTED" || !AWAITING_CONTENT.has(b.stage)) return null;
  return sheets.slice(0, no - 1).reverse().find((x) => AWAITING_CONTENT.has(x.stage))?.no ?? null;
}

/**
 * Tờ đã thông quan (kể cả đang sửa sau thông quan) trong lúc có tờ khác đang gọi về / gọi sửa đổi để gửi lại nội dung (R7): tờ đó không gửi lại,
 * chỉ tiêu chung lệch sửa qua khai bổ sung AMA – giao diện ghi chú. Không tờ nào đang gọi về → rỗng.
 */
export function clearedWhileResending(sheets: BranchSubmission[]): number[] {
  if (!sheets.some((b) => b.stage === "RECALLED" || b.stage === "AMEND_RECALLED")) return [];
  return sheets.filter((b) => b.stage === "CLEARED" || b.stage.startsWith("POST_")).map((b) => b.no);
}

/** Tờ bị từ chối / lỗi gửi (theo summary gộp của backend). */
export const problemOf = (s: SubmissionView, no: number) => s.summary.problems.find((p) => p.no === no)?.kind ?? null;

/** Còn tờ nào đang chờ gửi / phản hồi / hỏi trạng thái → màn tiếp tục hỏi lại. */
export const anyInProgress = (s: SubmissionView) => s.inProgress || s.branches.some((b) => b.inProgress);

/** Bước 7 hiện khi có ít nhất một tờ đã thông quan / đang sửa sau thông quan (tờ thông quan trước làm AMA ngay, không chờ tờ khác). */
export const anyPostVisible = (s: SubmissionView) => sheetsOf(s).some((b) => postStepVisible(b.stage));

/** Tờ mở ở bước 7: `?branch=` hợp lệ → tờ đó; không thì tờ đang sửa sau thông quan, rồi tờ đã thông quan đầu tiên, rồi tờ 1. */
export function postSheet(sheets: BranchSubmission[], requested: string | null): number {
  const n = Number(requested);
  if (requested && Number.isInteger(n) && n >= 1 && n <= sheets.length) return n;
  return sheets.find((b) => b.stage.startsWith("POST_"))?.no ?? sheets.find((b) => postStepVisible(b.stage))?.no ?? 1;
}
