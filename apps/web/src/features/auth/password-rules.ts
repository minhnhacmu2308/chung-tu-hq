// Kiểm mật khẩu mới phía giao diện theo đúng PasswordSchema của @kb/contracts (8–128 ký tự, như trang đăng ký và backend).
import { PasswordSchema, VerifyEmailInputSchema } from "@kb/contracts";
import { pickMessages, type UiLocale } from "@kb/ui";
import { AUTH_LINK_COMMON_MESSAGES } from "./auth-links.messages";

export type NewPasswordErrors = { password?: string; confirm?: string };

export function newPasswordErrors(password: string, confirm: string, locale: UiLocale): NewPasswordErrors {
  const t = pickMessages(AUTH_LINK_COMMON_MESSAGES, locale);
  const errors: NewPasswordErrors = {};
  if (!PasswordSchema.safeParse(password).success) errors.password = password.length > 128 ? t.passwordMax : t.passwordMin;
  if (confirm !== password) errors.confirm = t.confirmMismatch;
  return errors;
}

/** Lỗi token liên kết email (dùng rồi / hết hạn / sai) – trang chuyển sang trạng thái "liên kết không hợp lệ". */
export const isTokenInvalid = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === "TOKEN_INVALID";

/** Token có đúng dạng contracts không (≥16 ký tự). Link bị trình đọc mail cắt ngắn → coi như liên kết không hợp lệ, khỏi gọi server (server trả VALIDATION). */
export const isTokenWellFormed = (token: string) => VerifyEmailInputSchema.shape.token.safeParse(token).success;
