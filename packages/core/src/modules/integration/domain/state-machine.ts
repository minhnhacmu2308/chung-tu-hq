// Trạng thái truyền tờ khai (ADR 0005) theo giai đoạn vòng đời dùng chung `@kb/contracts/customs-flow` (stageAfter, operationAvailability).
// Giai đoạn chi tiết lưu ở results.raw.stage; cột `state` giữ nghĩa thô cho màn danh sách và dữ liệu cũ. Thuần.
import { stageFromLegacy, type CustomsInfo, type CustomsRejection, type CustomsOperation, type CustomsStage, type SubmissionState } from "@kb/contracts";

/** Phần phụ của kết quả truyền (jsonb). `progress` là trường cũ (trước khi có `stage`) – chỉ đọc. */
export type ResultRaw = {
  stage?: CustomsStage;
  progress?: string;
  receiptNo?: string;
  lastStatus?: string;
  /** Số lần sửa đổi bổ sung (IDE) / sửa sau thông quan (AMC) thành công. */
  amendments?: number;
  postAmendments?: number;
  /** Nghiệp vụ đã thành công ít nhất một lần. */
  done?: CustomsOperation[];
  /** Kết quả gần nhất của nghiệp vụ phụ (số tiếp nhận HYS, container, lệ phí cảng). */
  side?: Partial<Record<CustomsOperation, string>>;
  /** Chứng thư số đã chọn khi truyền lần đầu – ký cho các nghiệp vụ sau. */
  certificateId?: string;
  /** Thông tin Hải quan trả về (gộp dần qua IDA/IDC/IID…). */
  customsInfo?: CustomsInfo;
  /** Lần gửi bị Hải quan/FPT từ chối gần nhất; xóa khi chính nghiệp vụ đó gửi lại thành công. */
  rejection?: CustomsRejection;
};

export const stageOf = (r: { state: SubmissionState; raw: ResultRaw | null } | null): CustomsStage =>
  !r ? "NOT_SENT" : r.raw?.stage ?? stageFromLegacy(r.raw?.progress, r.state);

/** Giá trị cột `state` (thô) theo giai đoạn; lỗi gửi → SEND_FAILED nhưng giai đoạn giữ nguyên trong raw.stage. */
export function coarseState(stage: CustomsStage, failed = false): SubmissionState {
  if (failed) return "SEND_FAILED";
  switch (stage) {
    case "NOT_SENT": return "APPROVED";
    case "PRE_DECLARED": case "RECALLED": return "PRE_DECLARED";
    case "DECLARED": case "AMEND_RECALLED": case "AMEND_PRE_DECLARED": return "DECLARED";
    case "CLEARED": case "POST_EDITING": case "POST_PRE_DECLARED": case "POST_RECALLED": return "CLEARED";
    case "REJECTED": return "REJECTED";
  }
}

/** Không còn nghiệp vụ nào (Hải quan từ chối/hủy). Đã thông quan vẫn còn sửa đổi sau thông quan. */
export const TERMINAL: ReadonlySet<CustomsStage> = new Set(["REJECTED"]);

/** Trạng thái hồ sơ trên màn Khai báo Hải quan. */
export function rowState(stage: CustomsStage, started: boolean, pending: boolean): "READY" | "SENDING" | "INSPECTING" | "CLEARED" {
  if (!started) return "READY";
  if (pending) return "SENDING";
  if (stage === "CLEARED" || stage.startsWith("POST_")) return "CLEARED";
  if (stage === "PRE_DECLARED" || stage === "RECALLED" || stage === "NOT_SENT") return "SENDING";
  return "INSPECTING";
}
