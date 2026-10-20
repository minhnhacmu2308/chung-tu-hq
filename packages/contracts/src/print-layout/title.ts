import type { CustomsStage } from "../customs-flow.js";

/** Tiêu đề bản in + watermark theo giai đoạn khai (spec §3.1). Chưa khai / bị từ chối / chưa có kết quả → bản nháp. */
export function printTitle(kind: "IDA" | "EDA", stage: CustomsStage | undefined): { title: string; watermark: string | null } {
  const base = kind === "IDA" ? "Tờ khai hàng hóa nhập khẩu" : "Tờ khai hàng hóa xuất khẩu";
  switch (stage) {
    case undefined: case "NOT_SENT": case "REJECTED":
      return { title: `${base} – BẢN NHÁP`, watermark: "BẢN NHÁP – CHƯA KHAI HẢI QUAN" };
    case "PRE_DECLARED": case "RECALLED":
      return { title: `${base} – KHAI TẠM`, watermark: "KHAI TẠM – CHƯA ĐĂNG KÝ" };
    case "DECLARED": case "AMEND_RECALLED": case "AMEND_PRE_DECLARED":
      return { title: `${base} (thông báo kết quả phân luồng)`, watermark: null };
    case "CLEARED": case "POST_EDITING": case "POST_PRE_DECLARED": case "POST_RECALLED":
      return { title: `${base} (thông quan)`, watermark: null };
    default: {
      // Giai đoạn mới trong CustomsStage → lỗi biên dịch ở đây cho tới khi xếp vào một nhóm.
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}
