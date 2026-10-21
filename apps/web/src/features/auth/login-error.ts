import { pickMessages, type UiLocale } from "@kb/ui";
import { ApiError } from "@/lib/api-error";
import { LOGIN_MESSAGES } from "./auth.messages";

/** Mã lỗi chỉ trả về SAU khi mật khẩu đã đúng → nói rõ lý do được; các lỗi còn lại giữ câu chung để không lộ email nào tồn tại. */
const EXPLAINED = new Set(["MEMBERSHIP_PENDING", "MEMBERSHIP_DISABLED", "NO_ORGANIZATION", "RATE_LIMITED", "NETWORK"]);

export function loginErrorMessage(error: unknown, locale: UiLocale = "vi"): string {
  return error instanceof ApiError && EXPLAINED.has(error.code) && error.message ? error.message : pickMessages(LOGIN_MESSAGES, locale).wrongCredentials;
}
