export type DomainErrorCode =
  | "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "VALIDATION"
  | "EMAIL_TAKEN" | "TAX_CODE_EXISTS" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "TOKEN_INVALID" | "RATE_LIMITED"
  | "UNAUTHENTICATED" | "MEMBERSHIP_PENDING" | "MEMBERSHIP_DISABLED" | "NO_ORGANIZATION" | "DUPLICATE"
  | "DOSSIER_LOCKED" | "QUOTA_EXCEEDED" | "FILE_INVALID" | "FILE_TOO_LARGE" | "NOT_READY" | "NO_ITEMS" | "INVALID_HS" | "NO_DECLARATION"
  | "BLOCKER_FAILED" | "HS_UNCONFIRMED" | "NOT_APPROVED" | "ALREADY_SUBMITTED"
  | "SKILL_IN_USE" | "NOT_ENOUGH_SAMPLES" | "NOT_SUPPORTED" | "NO_CERT"
  | "INTEGRATION_NOT_CONFIGURED" | "GATEWAY_ERROR";

/** Lỗi nghiệp vụ dự kiến. `code` cố định để UI dịch sang tiếng Việt. */
export type DomainError = { code: DomainErrorCode; message?: string; details?: unknown };

export function domainError(code: DomainErrorCode, message?: string, details?: unknown): DomainError {
  return { code, ...(message !== undefined ? { message } : {}), ...(details !== undefined ? { details } : {}) };
}
