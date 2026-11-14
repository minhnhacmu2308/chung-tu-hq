// Phương thức thanh toán trên chứng từ → mã TK_IVP (chỉ tiêu 1.43 / 2.38). Dùng chung: ánh xạ tờ khai (core) và màn OCR (bắt chọn mã khi không nhận ra).
import { PAYMENT_METHODS } from "./code-tables.js";

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Giá trị người khai chọn ở OCR: đúng một mã trong PAYMENT_METHODS, có thể kèm " – <phương thức thực tế>" (dùng cho KC). */
export function parsePaymentChoice(raw: string): { code: string; detail: string | null } | null {
  const m = /^\s*([A-Z-]+)\s*(?:[–-]\s*(.+))?$/.exec(raw);
  if (!m || !PAYMENT_METHODS.some((p) => p.code === m[1])) return null;
  return { code: m[1]!, detail: m[2]?.trim() || null };
}

/** Giá trị lưu khi người khai chọn mã: KC giữ chữ gốc trên chứng từ để ghi chi tiết khai trị giá / ghi chú. */
export function paymentChoiceValue(code: string, original: string): string {
  const prev = parsePaymentChoice(original);
  const text = prev ? prev.detail : original.trim();
  return code === "KC" && text ? `KC – ${text}` : code;
}

/** OCR phải chọn lại mã: có chữ trên chứng từ mà không nhận ra mã chuẩn nào. */
export const paymentNeedsChoice = (raw: string | null | undefined): boolean => !!raw?.trim() && !!resolvePayment(raw)?.suspect;

export type ResolvedPayment = { code: string; name: string; note?: string; suspect?: true };

/**
 * Phương thức thanh toán trên chứng từ → mã TK_IVP (chỉ tiêu 1.43 / 2.38, Phụ lục II TT39).
 * TTR là "chuyển tiền bồi hoàn bằng điện" (hoàn trả L/C), KHÔNG phải T/T thường: T/T, chuyển khoản → KC ("Khác, bao gồm cả TT")
 * và ghi phương thức thực tế vào chi tiết khai trị giá (1.50) / ghi chú (2.57). Không nhận ra → KC kèm nghi ngờ.
 */
export function resolvePayment(raw: string | null): ResolvedPayment | null {
  if (!raw) return null;
  // Đúng mã chuẩn (người khai chọn ở OCR): "LC" hoặc "KC – <phương thức thực tế>".
  const exact = parsePaymentChoice(raw);
  if (exact) return { code: exact.code, name: PAYMENT_METHODS.find((p) => p.code === exact.code)!.label };
  const n = norm(raw);
  const kcNote = (what: string) => `Mã KC gồm cả ${what} – ghi phương thức thực tế (“${raw.trim()}”) vào chi tiết khai trị giá / ghi chú`;
  if (/\bTTR\b|REIMBURSE/.test(n)) return { code: "TTR", name: "Chuyển tiền bồi hoàn bằng điện" };
  if (/\bL ?C\b|LETTER OF CREDIT/.test(n)) return { code: "LC", name: "Tín dụng thư (L/C)" };
  if (/\bD ?A\b|DOCUMENTS? AGAINST ACCEPTANCE/.test(n)) return { code: "DA", name: "Nhờ thu chấp nhận chứng từ (D/A)" };
  if (/\bD ?P\b|DOCUMENTS? AGAINST PAYMENT/.test(n)) return { code: "DP", name: "Nhờ thu kèm chứng từ (D/P)" };
  if (/\bCAD\b|CASH AGAINST DOCUMENTS?/.test(n)) return { code: "CAD", name: "Trả tiền lấy chứng từ (CAD)" };
  if (/\bOA\b|OPEN ACCOUNT/.test(n)) return { code: "OA", name: "Mở tài khoản thanh toán (O/A)" };
  if (/\bCHEQUE\b|\bCHECK\b|\bSEC\b/.test(n)) return { code: "CHEQUE", name: "Séc" };
  if (/\bCASH\b|TIEN MAT/.test(n)) return { code: "CASH", name: "Tiền mặt" };
  if (/FREE OF CHARGE|\bFOC\b|NO COMMERCIAL VALUE|KHONG THANH TOAN|NO PAYMENT/.test(n)) return { code: "KHONGTT", name: "Không thanh toán" };
  if (/NETTING|OFFSET|CAN TRU|BU TRU/.test(n)) return { code: "CANTRU", name: "Cấn trừ, bù trừ" };
  if (/\bT ?T\b|TELEGRAPHIC|\bWIRE\b|BANK TRANSFER|REMITTANCE|CHUYEN KHOAN/.test(n)) return { code: "KC", name: "Khác (bao gồm cả TT)", note: kcNote("T/T, chuyển khoản") };
  return { code: "KC", name: "Khác", suspect: true, note: `Không nhận ra phương thức thanh toán “${raw.trim()}” – chọn mã TK_IVP; nếu khai KC thì ghi phương thức thực tế vào chi tiết khai trị giá / ghi chú` };
}

