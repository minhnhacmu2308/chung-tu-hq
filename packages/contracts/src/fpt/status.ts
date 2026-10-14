import { z } from "zod";

/**
 * Giải nghĩa trạng thái tờ khai FPT.VNACCS.
 * Nguồn: sheet `VN_IDA_TRANGTHAI` (VNACCS_IDA v1.2) – có bảng mã; sheet `VN_EDA_TRANGTHAI` chỉ ghi
 * "Luồng ID / Trạng Thái ID / Thông quan ID" không kèm bảng mã → dùng chung bảng của IDA (cần đối chiếu T1
 * cho EDA, nhất là tên nghiệp vụ EDA/EDC/EDA01/EDE thay cho IDA/IDC/IDA01/IDE).
 */

/** TK_LUONG (Long Integer): phân luồng. */
export const FPT_CHANNELS = {
  0: "Chưa phân luồng",
  1: "Luồng xanh",
  2: "Luồng vàng",
  3: "Luồng đỏ",
} as const;
export const FptChannelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type FptChannel = z.infer<typeof FptChannelSchema>;

/** TK_TRANGTHAI (Text 10 ở IDA, Text 255 ở EDA): trạng thái khai báo. */
export const FPT_DECLARATION_STATES = {
  T: "Lưu tạm",
  A: "Khai báo tạm (IDA)",
  C: "Khai chính thức (IDC)",
  TE: "Lưu tạm sửa đổi",
  A01: "Khai tạm sửa đổi (IDA01)",
  E: "Khai chính thức sửa đổi (IDE)",
  R: "Hủy",
} as const;
export const FptDeclarationStateSchema = z.enum(["T", "A", "C", "TE", "A01", "E", "R"]);
export type FptDeclarationState = z.infer<typeof FptDeclarationStateSchema>;

/** TK_THONGQUAN (Long Integer): thông quan. */
export const FPT_CLEARANCE = {
  0: "Chưa thông quan",
  1: "Đã thông quan",
} as const;
export const FptClearanceSchema = z.union([z.literal(0), z.literal(1)]);
export type FptClearance = z.infer<typeof FptClearanceSchema>;

/**
 * TRANG_THAI của chứng từ đính kèm bổ sung (API V5, sheet `HỎI KQ V5 Đính kèm CTBS`, Text(2)).
 * Không phải trạng thái tờ khai.
 */
export const FPT_ATTACHMENT_STATES = {
  "0": "Nhập mới",
  "10": "Từ chối",
  "11": "Chưa có phản hồi",
  "12": "Hải quan chấp nhận",
} as const;
export const FptAttachmentStateSchema = z.enum(["0", "10", "11", "12"]);
export type FptAttachmentState = z.infer<typeof FptAttachmentStateSchema>;
