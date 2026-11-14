// Trạng thái truyền tờ khai (ADR 0005) theo giai đoạn vòng đời dùng chung `@kb/contracts/customs-flow` (stageAfter, operationAvailability).
// Giai đoạn chi tiết lưu ở results.raw.stage; cột `state` giữ nghĩa thô cho màn danh sách và dữ liệu cũ. Thuần.
import { stageFromLegacy, type CustomsInfo, type CustomsRejection, type CustomsOperation, type CustomsStage, type SentSnapshot, type SubmissionState } from "@kb/contracts";

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
  /** Lô nhiều tờ: nội dung tờ Hải quan đang giữ (ảnh chụp lần gửi nội dung IDA/IDA01/EDA/EDA01 thành công gần nhất) – guard tờ chưa gọi về (spec §2.5). Đọc qua sentOf (Zod). */
  sent?: SentSnapshot;
  /**
   * Id dòng hàng của tờ trong lần gửi nội dung (IDA/IDA01/EDA/EDA01) thành công gần nhất – mọi lô, kể cả một tờ (C6: mặt hàng nhận số tờ khai theo dòng đã gửi).
   * Vắng = gửi trước khi có trường này / payload thiếu id dòng. Đọc qua Zod (_catalog-numbers).
   */
  sentLineIds?: string[];
  /**
   * C6: số tờ khai + khóa tập dòng đã gửi (`lines` – hash id dòng đã sắp, null = không biết dòng đã gửi) đã ghi xong vào danh mục
   * (CatalogPort.recordDeclarationNo thành công). Khác số hiện tại hoặc khác tập dòng đã gửi (IDA01/EDA01 đổi dòng, cùng số) → ghi lại
   * (poll / outbox chạy lại tự bù khi crash). Dạng chuỗi cũ = chỉ số, chưa biết tập dòng. Chỉ đặt bằng results.markCatalogNo; đọc qua Zod.
   */
  catalogNo?: string | { no: string; lines: string | null };
  /** C6: thời điểm (ISO, UTC) hệ thống nhận / lưu số tờ khai hiện tại của tờ – ngày ghi danh mục khi Hải quan không trả ngày đăng ký. */
  numberAt?: string;
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
