// Mẫu đọc câu cảnh báo tiếng Việt của hscode-api (dữ liệu nguồn chỉ có tiếng Việt) và tên Bộ viết tắt (tên pháp lý – không dịch).
import type { HsWarningDetail } from "@kb/contracts";

type LegacyRule = [RegExp, Pick<HsWarningDetail, "code" | "level" | "group">];

/** Câu cũ (chưa có warning_details) → mã như hscode-api mới. Thứ tự: khớp đầu câu đầu tiên. */
export const LEGACY: LegacyRule[] = [
  [/^Quản lý chuyên ngành/, { code: "SPECIALIZED_POLICY", level: "info", group: "policy" }],
  [/^Thuế GTGT .*phụ thuộc điều kiện/, { code: "VAT_CONDITIONAL", level: "info", group: "tax" }],
  [/^(Biểu thuế FTA chưa có kỳ|Thuế FTA của mã này còn đang giảm)/, { code: "FTA_LAST_PERIOD", level: "info", group: "tax" }],
  [/^Khác mã HS trên hóa đơn/, { code: "INVOICE_HS_MISMATCH", level: "danger", group: "classification" }],
  [/^Chưa tra được thuế/, { code: "TAX_MISSING", level: "danger", group: "tax" }],
  [/^Mã có biện pháp chống bán phá giá/, { code: "ANTIDUMPING", level: "danger", group: "policy" }],
  [/^Mã có biện pháp tự vệ/, { code: "SAFEGUARD", level: "danger", group: "policy" }],
  [/^Độ tin cậy thấp/, { code: "LOW_CONFIDENCE", level: "warning", group: "classification" }],
  [/^Mô tả có thể thiếu đặc điểm/, { code: "MISSING_DETAIL", level: "warning", group: "classification" }],
  [/^Chưa có thuế suất \S+ cho mã này/, { code: "FTA_RATE_MISSING", level: "warning", group: "tax" }],
];
export const POLICY_MINISTRY = /^Quản lý chuyên ngành \(([^)]+)\)/;
export const POLICY_PREFIX = /^Quản lý chuyên ngành(\s*\([^)]*\))?:\s*/;
export const FTA_MISSING_AGREEMENT = /^Chưa có thuế suất (\S+)/;

/** Tên Bộ dài → viết tắt thông dụng cho nhãn (thẻ chi tiết vẫn ghi đủ). Tên pháp lý – không dịch. */
export const MINISTRY_SHORT: Record<string, string> = {
  "Bộ Nông nghiệp và Phát triển nông thôn": "Bộ NN&PTNT",
  "Bộ Nông nghiệp và Môi trường": "Bộ NN&MT",
  "Bộ Khoa học và Công nghệ": "Bộ KH&CN",
  "Bộ Giao thông vận tải": "Bộ GTVT",
  "Bộ Thông tin và Truyền thông": "Bộ TT&TT",
  "Bộ Tài nguyên và Môi trường": "Bộ TN&MT",
  "Bộ Văn hóa, Thể thao và Du lịch": "Bộ VHTT&DL",
  "Bộ Lao động - Thương binh và Xã hội": "Bộ LĐTB&XH",
  "Ngân hàng Nhà nước Việt Nam": "NHNN",
};

export const LEGAL_REF = /^(Luật|Bộ luật|Nghị định|Thông tư|Quyết định|Nghị quyết|QCVN|TCVN|Công văn|Chỉ thị|Văn bản)(?=[\s:]|$)/;

