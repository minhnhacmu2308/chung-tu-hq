// Lỗi mock kèm mã lý do (@kb/contracts reason-codes) – cùng mã backend gửi, để giao diện dịch như khi chạy http.
import { reasonVi, type ReasonCode, type ReasonParams } from "@kb/contracts";
import { ApiError } from "@/lib/mock-request";

/** `message` mặc định là câu tiếng Việt chuẩn của mã; truyền `message` khi mock giữ câu riêng (test tìm theo chữ). */
export const reasonApiError = (code: string, reason: ReasonCode, params?: ReasonParams, message = reasonVi(reason, params)) =>
  new ApiError(code, message, 400, { reason, params });
