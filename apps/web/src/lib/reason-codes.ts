// Dịch chữ do backend sinh ra (lý do khóa nghiệp vụ, lý do chặn duyệt/truyền, lỗi nghiệp vụ) theo mã ổn định – server không dịch.
// Mã lạ (backend mới hơn giao diện) → giữ câu tiếng Việt của server.
import type { ReasonCode, ReasonParams } from "@kb/contracts";
import { fill, type UiLocale } from "@kb/ui";
import { DOMAIN_ERROR_MESSAGES, REASON_MESSAGES } from "./reason-codes.messages";

const has = <T extends object>(o: T, k: string): k is Extract<keyof T, string> => Object.prototype.hasOwnProperty.call(o, k);

/** Kiểu ghi rõ: backend thêm mã mới vào @kb/contracts mà quên bộ nhãn giao diện → lỗi TypeScript ở đây. */
const REASONS: Record<UiLocale, Record<ReasonCode, string>> = REASON_MESSAGES;

/** Mã có trong bộ nhãn của giao diện. */
export const isKnownReason = (code: string | undefined): code is ReasonCode => code !== undefined && has(REASONS.vi, code);

/**
 * Câu lý do theo ngôn ngữ: mã đã biết → bộ nhãn (điền `params`); mã lạ/thiếu → `fallback` (câu tiếng Việt server gửi kèm).
 * Tiếng Việt: bộ nhãn vi trùng từng chữ với câu server (có test) nên kết quả như cũ.
 */
export function reasonText(code: string | undefined, params: ReasonParams | undefined, fallback: string | undefined, locale: UiLocale): string {
  if (isKnownReason(code)) return fill(REASONS[locale][code], params ?? {});
  return fallback ?? "";
}

/** Lý do của một dòng nghiệp vụ / tùy chọn có `reason` + `reasonCode` + `reasonParams` (PipelineRow, OperationAvailability). */
export const rowReason = (r: { reason?: string | undefined; reasonCode?: string | undefined; reasonParams?: ReasonParams | undefined }, locale: UiLocale): string | undefined =>
  r.reason || r.reasonCode ? reasonText(r.reasonCode, r.reasonParams, r.reason, locale) || undefined : undefined;

type ErrorLike = { code?: unknown; message?: unknown; reason?: unknown; params?: unknown };

/**
 * Thông báo của lỗi bắt được (ApiError từ http/mock, Error thường) theo ngôn ngữ:
 * 1. tiếng Việt → nguyên `message` server (cụ thể nhất, giữ như cũ);
 * 2. en/zh, có mã lý do đã biết → câu theo mã lý do;
 * 3. en/zh, không → câu chung theo `code` (DomainError) nếu biết; không thì `message`.
 * Không phải Error → `fallback`.
 */
export function errorText(error: unknown, locale: UiLocale, fallback = ""): string {
  if (!(error instanceof Error)) return fallback;
  const e = error as Error & ErrorLike;
  const reason = typeof e.reason === "string" ? e.reason : undefined;
  const params = e.params && typeof e.params === "object" ? (e.params as ReasonParams) : undefined;
  if (locale === "vi") return e.message || (isKnownReason(reason) ? reasonText(reason, params, fallback, locale) : fallback);
  if (isKnownReason(reason)) return reasonText(reason, params, e.message, locale);
  const code = typeof e.code === "string" ? e.code : undefined;
  if (code && has(DOMAIN_ERROR_MESSAGES[locale], code)) return DOMAIN_ERROR_MESSAGES[locale][code];
  return e.message || fallback;
}
