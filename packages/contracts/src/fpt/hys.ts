import { z } from "zod";
import { FPT_CREDENTIAL_ROWS, fptKey, fptObjectSchema, toFptFields, type FptFieldMeta, type FptFieldRow } from "./common.js";

/**
 * Hồ sơ đính kèm điện tử (nghiệp vụ HYS) – đặc tả `VNACCS_HYS v1.2.xlsx`, sheet `HYS` + `LIST_FILE`.
 *
 * Sheet HYS có 16 dòng: 15 trường vô hướng + `LIST_FILE` (Type "List", bắt buộc, chỉ Request:
 * "List file đính kèm (dung lượng nhỏ hơn 2mb)"). Cột Request/Response:
 * - Request + Response: 4 trường tài khoản, TK_CH, TK_CHB, TK_TSB, TK_STL, TK_REF, TK_KJJ.
 * - Chỉ Request: LIST_FILE.
 * - Chỉ Response: TK_JNO (số tiếp nhận HYS), TK_TNM, TK_YMD, TK_SNM, TK_SAD.
 *
 * Key JSON theo `fptKey` (TK_CH → tK_CH, LIST_FILE → lisT_FILE, FILE_NAME → filE_NAME) là SUY LUẬN
 * từ quy ước camelCase của format.json – chưa có mẫu HYS, cần đối chiếu T1.
 */

/** Sheet `HYS` (VNACCS_HYS v1.2.xlsx) – trường gửi đi (cũng có trong phản hồi). */
export const HYS_REQUEST_ROWS = [
  ...FPT_CREDENTIAL_ROWS,
  ["TK_CH", "text", "6", true, "Mã chi cục"],
  ["TK_CHB", "text", "2", false, "Mã đội thủ tục"],
  ["TK_TSB", "text", "3", true, "Phân loại thủ tục", { category: "Danh mục TK_TSB – xem HYS_PROCEDURE_CODES" }],
  ["TK_STL", "text", "20", false, "Số điện thoại"],
  ["TK_REF", "text", "20", false, "Số quản lý nội bộ"],
  ["TK_KJJ", "text", "332", false, "Ghi chú"],
] as const satisfies readonly FptFieldRow[];

/** Sheet `HYS` – trường chỉ có trong phản hồi. */
export const HYS_RESPONSE_ONLY_ROWS = [
  ["TK_JNO", "text", "12", false, "Số tiếp nhận đính kèm HYS"],
  ["TK_TNM", "text", "70", false, "Tên thủ tục"],
  ["TK_YMD", "date", null, false, "Ngày tiếp nhận", { note: "Sheet ghi Type \"Datetime\" size 8 – coi là ngày dd/MM/yyyy" }],
  ["TK_SNM", "text", "100", false, "Tên công ty"],
  ["TK_SAD", "text", "100", false, "Địa chỉ công ty"],
] as const satisfies readonly FptFieldRow[];

/** Sheet `LIST_FILE` (2 dòng). */
export const HYS_LIST_FILE_ROWS = [
  ["FILE_NAME", "text", "255", true, "Tên file"],
  ["FILE_BASE64", "text", null, true, "Base64", { note: "Size \"max\"; tổng file đính kèm < 2MB theo sheet HYS" }],
] as const satisfies readonly FptFieldRow[];

/** 15 trường vô hướng của sheet HYS (không gồm LIST_FILE). */
export const HYS_FIELDS: FptFieldMeta[] = toFptFields([...HYS_REQUEST_ROWS, ...HYS_RESPONSE_ONLY_ROWS]);
export const HYS_LIST_FILE_FIELDS: FptFieldMeta[] = toFptFields(HYS_LIST_FILE_ROWS);

export const HysFileSchema = fptObjectSchema(HYS_LIST_FILE_ROWS);
export type HysFile = z.infer<typeof HysFileSchema>;

/** Key JSON của danh sách file. */
export const HYS_LIST_FILE_KEY = fptKey("LIST_FILE");
type HysListFileKey = typeof HYS_LIST_FILE_KEY;

const HysRequestBaseSchema = fptObjectSchema(HYS_REQUEST_ROWS);
export type HysRequest = z.infer<typeof HysRequestBaseSchema> & { [K in HysListFileKey]: HysFile[] };
export const HysRequestSchema: z.ZodType<HysRequest> = z.intersection(
  HysRequestBaseSchema,
  z.object({ [HYS_LIST_FILE_KEY]: z.array(HysFileSchema).min(1) }),
);

export const HysResponseSchema = fptObjectSchema([...HYS_REQUEST_ROWS, ...HYS_RESPONSE_ONLY_ROWS], "response");
export type HysResponse = z.infer<typeof HysResponseSchema>;

/** Danh mục TK_TSB (Phân loại thủ tục) – cuối sheet HYS. */
export const HYS_PROCEDURE_CODES = {
  A01: "Tờ khai trị giá đính kèm",
  A02: "Danh sách container chất lên tàu",
  A03: "Danh mục máy móc thiết bị đồng bộ",
  A04: "DM vật tư, thiết bị NK đóng mới, sửa chữa, bảo dưỡng đầu máy, toa xe",
  A05: "DM vật tư, thiết bị NK phục vụ sản xuất sản phẩm cơ khí trọng điểm",
  A06: "Chứng thư bảo lãnh chung trong khai báo xuất nhập khẩu",
  A08: "Chứng thư bảo lãnh riêng trong khai báo xuất nhập khẩu",
  A12: "Quyết định giảm thuế",
  A13: "Tờ khai khoản thu đóng góp bắt buộc",
  A20: "Hợp đồng thuê kho ngoại quan",
  A21: "Quyết định buộc tái xuất của cơ quan có thẩm quyền",
  A22: "Các thông tin liên quan đến vận chuyển kết hợp phải khai đính kèm theo hướng dẫn",
  A30: "Thông tin phương tiện giao thông đường bộ nhập khẩu",
  A99: "Loại khác",
} as const;
export type HysProcedureCode = keyof typeof HYS_PROCEDURE_CODES;
