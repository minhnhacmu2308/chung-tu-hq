import { ApiError } from "@/lib/api-error";

/** Mã lỗi chỉ trả về SAU khi mật khẩu đã đúng → nói rõ lý do được; các lỗi còn lại giữ câu chung để không lộ email nào tồn tại. */
const EXPLAINED = new Set(["MEMBERSHIP_PENDING", "MEMBERSHIP_DISABLED", "NO_ORGANIZATION", "RATE_LIMITED", "NETWORK"]);

export function loginErrorMessage(error: unknown): string {
  return error instanceof ApiError && EXPLAINED.has(error.code) && error.message ? error.message : "Sai email hoặc mật khẩu.";
}
