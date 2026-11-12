// Mẫu số hóa đơn thương mại do doanh nghiệp cấu hình (ADR 0013 mục 3). THUẦN – backend cấp số, giao diện xem trước dùng chung.
// Số là string (bất biến 2). Cấp trong transaction, duy nhất theo (org, loại, số), không tái dùng.
import { z } from "zod";

/** Đánh lại số thứ tự: mỗi tháng, mỗi năm, hoặc không bao giờ. */
export const NumberResetSchema = z.enum(["MONTH", "YEAR", "NEVER"]);
export type NumberReset = z.infer<typeof NumberResetSchema>;

/**
 * Mẫu: chữ in hoa, số, `- / . _` cố định + mã ngày `{YYYY}` `{YY}` `{MM}` + đúng một mã số thứ tự `{NNN}` (3–8 chữ N = độ dài tối thiểu).
 * Ví dụ: `INV{YY}{MM}-{NNN}` → INV2611-001.
 */
const TOKEN = /\{(YYYY|YY|MM|N{3,8})\}/g;
const LITERAL = /^[A-Z0-9\-/._]*$/;
export const MAX_DOC_NO_LEN = 35;

export type PatternIssue = "EMPTY" | "BAD_CHARS" | "NO_SEQ" | "MANY_SEQ" | "TOO_LONG" | "RESET_NEEDS_DATE";

/** Lỗi đầu tiên của mẫu (null = hợp lệ). `MONTH` cần `{MM}` và năm; `YEAR` cần năm – tránh trùng số sau khi đánh lại. */
export function patternIssue(pattern: string, reset: NumberReset): PatternIssue | null {
  if (!pattern) return "EMPTY";
  const literal = pattern.replace(TOKEN, "");
  if (!LITERAL.test(literal)) return "BAD_CHARS";
  const seqs = pattern.match(/\{N{3,8}\}/g) ?? [];
  if (seqs.length === 0) return "NO_SEQ";
  if (seqs.length > 1) return "MANY_SEQ";
  const hasYear = /\{YYYY\}|\{YY\}/.test(pattern);
  if (reset === "YEAR" && !hasYear) return "RESET_NEEDS_DATE";
  if (reset === "MONTH" && !(hasYear && pattern.includes("{MM}"))) return "RESET_NEEDS_DATE";
  if (formatDocNo(pattern, "2099-12-31", 1).length > MAX_DOC_NO_LEN) return "TOO_LONG";
  return null;
}

const ISSUE_VI: Record<PatternIssue, string> = {
  EMPTY: "Nhập mẫu số hóa đơn",
  BAD_CHARS: "Mẫu chỉ gồm chữ in hoa, số, - / . _ và các mã {YYYY} {YY} {MM} {NNN}",
  NO_SEQ: "Mẫu phải có mã số thứ tự {NNN} (3–8 chữ N)",
  MANY_SEQ: "Mẫu chỉ được có một mã số thứ tự",
  TOO_LONG: `Số hóa đơn dài quá ${MAX_DOC_NO_LEN} ký tự`,
  RESET_NEEDS_DATE: "Đánh lại theo tháng cần {YY}/{YYYY} và {MM}; theo năm cần {YY}/{YYYY} – nếu không số sẽ trùng",
};

export const InvoiceNumberingSchema = z
  .object({ pattern: z.string().trim().toUpperCase().max(60), reset: NumberResetSchema })
  .superRefine((v, c) => {
    const i = patternIssue(v.pattern, v.reset);
    if (i) c.addIssue({ code: "custom", path: ["pattern"], message: ISSUE_VI[i], params: { issue: i } });
  });
export type InvoiceNumbering = z.infer<typeof InvoiceNumberingSchema>;

/** Mặc định (chốt 2026-11-10): `INV{YY}{MM}-{NNN}`, đánh lại mỗi tháng. */
export const DEFAULT_INVOICE_NUMBERING: InvoiceNumbering = { pattern: "INV{YY}{MM}-{NNN}", reset: "MONTH" };

/** Số từ mẫu, ngày cấp `YYYY-MM-DD`, số thứ tự. Quá độ dài tối thiểu thì phần số dài thêm, không quay vòng. */
export function formatDocNo(pattern: string, isoDate: string, seq: number): string {
  return pattern.replace(TOKEN, (_, t: string) => {
    if (t === "YYYY") return isoDate.slice(0, 4);
    if (t === "YY") return isoDate.slice(2, 4);
    if (t === "MM") return isoDate.slice(5, 7);
    return String(seq).padStart(t.length, "0");
  });
}

/** Kỳ của bộ đếm theo cách đánh lại: "2611" (tháng) / "26" (năm) / "ALL". */
export function periodKey(reset: NumberReset, isoDate: string): string {
  if (reset === "MONTH") return `${isoDate.slice(2, 4)}${isoDate.slice(5, 7)}`;
  if (reset === "YEAR") return isoDate.slice(0, 4);
  return "ALL";
}

/** Mẫu số từ cột DB (null/không hợp lệ → mặc định). */
export function numberingFromColumns(pattern: string | null | undefined, reset: string | null | undefined): InvoiceNumbering {
  const p = InvoiceNumberingSchema.safeParse({ pattern: pattern ?? "", reset: reset ?? "" });
  return p.success ? p.data : DEFAULT_INVOICE_NUMBERING;
}
