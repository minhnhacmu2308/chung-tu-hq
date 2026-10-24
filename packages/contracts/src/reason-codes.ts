// Mã lý do ổn định cho chữ do backend sinh ra mà giao diện hiển thị (lý do khóa nghiệp vụ Hải quan, lý do chặn duyệt/truyền).
// Backend KHÔNG dịch: luôn gửi kèm câu tiếng Việt (`reason` / `message`) để tương thích ngược, cộng mã + tham số để giao diện
// dịch sang en/zh (apps/web/src/lib/reason-codes.messages.ts – bản `vi` ở đó phải trùng từng chữ với bảng dưới đây, có test).
import { z } from "zod";

/** Câu tiếng Việt chuẩn của từng mã. `{tên}` là tham số (`reasonParams` / `params`). */
export const REASON_TEXT_VI = {
  // ── Lý do khóa nghiệp vụ ở bước Khai báo Hải quan (customs-flow.operationAvailability) ──
  OPERATION_PENDING: "Đang chờ phản hồi {ops}",
  EDIT_DECLARATION_FIRST: "Sửa chỉ tiêu ở bước Review tờ khai và phê duyệt lại",
  DECLARATION_REJECTED: "Tờ khai đã bị Hải quan từ chối/hủy",
  IDA_ALREADY_PRE_DECLARED: "Đã khai tạm – muốn sửa thì gọi sửa đổi tờ khai tạm trước",
  IDB_REQUIRES_PRE_DECLARED: "Chỉ gọi sửa khi đã khai tạm và chưa khai chính thức",
  IDC_REQUIRES_PRE_DECLARED: "Khai tạm trước để nhận số tờ khai",
  IDC_ALREADY_DECLARED: "Đã khai chính thức",
  IDD_ONLY_BEFORE_CLEARANCE: "Chỉ sửa đổi bổ sung trước khi thông quan",
  IDD_REQUIRES_CHANNEL: "Sau khi khai chính thức và có phân luồng",
  IDA01_REQUIRES_RECALL: "Gọi tờ khai đã phân luồng về sửa trước",
  IDE_REQUIRES_IDA01: "Khai tạm sửa đổi bổ sung trước",
  AMA_REQUIRES_CLEARANCE: "Chỉ khai sửa đổi sau khi tờ khai đã thông quan",
  AMA_NOT_PRE_DECLARED: "Sau khi đã khai tạm AMA",
  DECLARATION_NUMBER_REQUIRED: "Cần có số tờ khai (khai tạm trước)",
  CONT_REQUIRES_CHANNEL: "Sau khi tờ khai đã phân luồng",
  NO_CONTAINERS: "Lô hàng không có container",
  START_POST_EDIT_FIRST: "Bấm “Bắt đầu sửa sau thông quan” để lập bản khai bổ sung trước",
  NOT_SUBMITTED_YET: "Hồ sơ chưa truyền – ký số và khai tạm trước",

  // ── Chặn chuyển sang Review / phê duyệt tờ khai (declaration canMoveToReview, canApprove) ──
  DECLARATION_NOT_BUILT: "Chưa dựng tờ khai – chạy agent với lựa chọn có “Tạo tờ khai”",
  APPROVER_ROLE_REQUIRED: "Chỉ Người duyệt hoặc Chủ sở hữu được phê duyệt tờ khai",
  DECLARATION_NOT_CREATED: "Chưa có tờ khai",
  DECLARATION_ALREADY_APPROVED: "Tờ khai đã được duyệt",
  BLOCKER_RULES_FAILED_FIX_IN_OCR: "Còn {n} luật lỗi chặn truyền – xử lý ở bước OCR & kiểm tra",
  HS_UNCONFIRMED: "Còn {n} mã HS chưa xác nhận",
  EXCHANGE_RATE_MISSING: "Chưa có tỷ giá tính thuế – nhập tỷ giá rồi chạy lại agent",
  FOUR_EYES: "Người duyệt phải khác người tạo hồ sơ (nguyên tắc 4 mắt)",
  BLOCKING_FIELDS_MISSING: "Chưa khai chỉ tiêu bắt buộc: {fields}",
  REQUIRED_FIELDS_MISSING_EDIT: "Còn {n} chỉ tiêu bắt buộc chưa nhập: {fields} – bấm Sửa ở từng chỉ tiêu rồi duyệt lại",
  REQUIRED_FIELDS_MISSING_APPROVE: "Còn {n} chỉ tiêu bắt buộc chưa nhập: {fields} – nhập trên tờ khai rồi duyệt lại",

  // ── Chặn ký số & truyền (submit-declaration, perform-operation, canSubmit) ──
  DOSSIER_CANCELLED: "Hồ sơ đã hủy",
  DOSSIER_ALREADY_SUBMITTED: "Hồ sơ đã truyền",
  DOSSIER_NOT_APPROVED: "Hồ sơ chưa ở trạng thái đã duyệt",
  DECLARATION_ALREADY_SUBMITTED: "Tờ khai đã được truyền – không gửi trùng",
  DECLARATION_SUBMITTED: "Tờ khai đã truyền",
  DECLARATION_NOT_APPROVED: "Tờ khai chưa được phê duyệt",
  DECLARATION_NOT_REAPPROVED: "Tờ khai chưa được phê duyệt lại sau khi sửa",
  BLOCKER_RULES_FAILED: "Còn {n} luật lỗi chặn truyền",
  RATE_WEEK_CHANGED_REOPEN: "Tờ khai dùng tỷ giá tuần {week} – đã sang tuần tỷ giá mới. Mở lại tờ khai để dựng lại với tỷ giá tuần này rồi duyệt lại",
  RATE_WEEK_CHANGED_REBUILD: "Tờ khai dùng tỷ giá tuần {week} – đã sang tuần tỷ giá mới. Dựng lại tờ khai với tỷ giá tuần này rồi duyệt lại",
  REQUIRED_FIELDS_MISSING_SUBMIT: "Còn {n} chỉ tiêu bắt buộc chưa nhập: {fields} – mở lại tờ khai để nhập rồi duyệt lại",
  DECLARATION_NOT_TRANSMITTABLE: "Tờ khai chưa truyền được: {blockers}",
  DECLARATION_SPEC_INVALID: "Tờ khai chưa đúng đặc tả truyền Hải quan: {issues}",
  SHEETS_RECALL_FIRST: "Tờ {sheets}: gọi về sửa (IDB/IDD) trước",
  AMENDMENT_NOT_APPROVED: "Bản khai bổ sung chưa được phê duyệt",
  AMENDMENT_NOT_TRANSMITTABLE: "Bản khai bổ sung chưa gửi được: {blockers}",
  CERTIFICATE_REQUIRED: "Chọn chứng thư số để ký",

  // ── Danh mục hàng hóa của doanh nghiệp ──
  PRODUCT_CODE_EXISTS: "Danh mục đã có mặt hàng mã {code}",
  PRODUCT_NAME_EXISTS: "Danh mục đã có mặt hàng cùng tên",
  PRODUCT_NOT_FOUND: "Không tìm thấy mặt hàng trong danh mục",
  MAILBOX_NOT_CONFIGURED: "Máy chủ chưa cấu hình kết nối {provider}",
  MAILBOX_AUTH_FAILED: "Không kết nối được hộp thư – đăng nhập hoặc cấp quyền không thành công",
  MAILBOX_STATE_INVALID: "Phiên kết nối hộp thư đã hết hạn, hãy bấm kết nối lại",
  MAILBOX_REAUTH_REQUIRED: "Hộp thư {email} đã thu hồi quyền hoặc hết hạn – hãy kết nối lại",
  MAILBOX_SYNC_FAILED: "Lấy thư không thành công, thử lại sau",
  MAILBOX_NOT_FOUND: "Không tìm thấy hộp thư đã kết nối",
  INBOX_MESSAGE_NOT_FOUND: "Không tìm thấy email trong hộp thư chứng từ",
  INBOX_ATTACHMENT_ADDED: "File đã được thêm vào hồ sơ {code}",
} as const;

export type ReasonCode = keyof typeof REASON_TEXT_VI;
export const REASON_CODES = Object.keys(REASON_TEXT_VI) as ReasonCode[];

/** Tham số điền vào câu lý do (số lượng, danh sách mã nghiệp vụ, tuần tỷ giá…). */
export const ReasonParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));
export type ReasonParams = z.infer<typeof ReasonParamsSchema>;

/**
 * Mã lý do trên dây: chuỗi (không phải enum) để giao diện cũ gặp mã mới vẫn parse được và rơi về câu tiếng Việt của backend.
 * Bên phát sinh dùng kiểu `ReasonCode`.
 */
export const ReasonCodeSchema = z.string().min(1);

/** Điền tham số: `fillReason("Còn {n} mã HS", { n: 2 })`; thiếu tham số → giữ nguyên `{tên}`. */
export function fillReason(template: string, params?: ReasonParams): string {
  return params ? template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : template;
}

/** Câu tiếng Việt của một mã lý do (backend gửi kèm mã cho tương thích ngược). */
export const reasonVi = (code: ReasonCode, params?: ReasonParams): string => fillReason(REASON_TEXT_VI[code], params);
