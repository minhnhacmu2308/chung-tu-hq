import { reasonVi, type ReasonCode, type ReasonParams } from "@kb/contracts";

export type DomainErrorCode =
  | "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "VALIDATION"
  | "EMAIL_TAKEN" | "TAX_CODE_EXISTS" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "TOKEN_INVALID" | "RATE_LIMITED"
  | "UNAUTHENTICATED" | "MEMBERSHIP_PENDING" | "MEMBERSHIP_DISABLED" | "NO_ORGANIZATION" | "DUPLICATE"
  | "DOSSIER_LOCKED" | "QUOTA_EXCEEDED" | "FILE_INVALID" | "FILE_TOO_LARGE" | "NOT_READY" | "NO_ITEMS" | "INVALID_HS" | "NO_DECLARATION"
  | "BLOCKER_FAILED" | "HS_UNCONFIRMED" | "NOT_APPROVED" | "ALREADY_SUBMITTED" | "RATE_WEEK_CHANGED"
  | "SKILL_IN_USE" | "NOT_ENOUGH_SAMPLES" | "NOT_SUPPORTED" | "NO_CERT"
  | "INTEGRATION_NOT_CONFIGURED" | "GATEWAY_ERROR"
  | "CONFLICT" | "ORG_SUSPENDED" | "MFA_REQUIRED" | "MFA_INVALID" | "PASSWORD_CHANGE_REQUIRED";

/**
 * Lỗi nghiệp vụ dự kiến. `code` cố định (map HTTP), `message` tiếng Việt. Server KHÔNG dịch: lỗi người dùng hay gặp
 * gắn thêm `reason` (mã lý do ổn định – @kb/contracts reason-codes) + `params` để giao diện dịch sang en/zh.
 */
export type DomainError = { code: DomainErrorCode; message?: string; details?: unknown; reason?: ReasonCode; params?: ReasonParams };

export function domainError(code: DomainErrorCode, message?: string, details?: unknown): DomainError {
  return { code, ...(message !== undefined ? { message } : {}), ...(details !== undefined ? { details } : {}) };
}

/** Lỗi kèm mã lý do: `message` là câu tiếng Việt chuẩn của mã (reasonVi), giao diện dịch theo `reason` + `params`. */
export function reasonError(code: DomainErrorCode, reason: ReasonCode, params?: ReasonParams, details?: unknown): DomainError {
  return { code, message: reasonVi(reason, params), reason, ...(params ? { params } : {}), ...(details !== undefined ? { details } : {}) };
}
