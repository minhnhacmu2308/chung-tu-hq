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

/** OCR phải chọn lại mã: đối chiếu chữ trên chứng từ / mã AI / số L/C ra kết quả cần xem (xem reconcilePayment). */
export const paymentNeedsChoice = (raw: string | null | undefined, aiCode?: string | null, lcNo?: string | null): boolean =>
  !!reconcilePayment(raw ?? null, aiCode ?? null, lcNo ?? null)?.suspect;

/**
 * Mã PTTT: AI chọn mã, regex (resolvePayment) kiểm chéo, số L/C là thêm một tín hiệu LC.
 * Người khai đã chọn mã → thắng. Cùng mã → nhận. Khác, hoặc chỉ một bên có → cần xem; mặc định mã regex (nếu nhận ra) → mã AI → LC.
 */
export function reconcilePayment(raw: string | null, aiCode: string | null, lcNo: string | null): ResolvedPayment | null {
  const text = raw?.trim() || null;
  if (text && parsePaymentChoice(text)) return resolvePayment(text);
  const rx = text ? resolvePayment(text) : null;
  const rxCode = rx && !rx.suspect ? rx.code : null;
  const ai = PAYMENT_METHODS.find((p) => p.code === aiCode?.trim().toUpperCase())?.code ?? null;
  const lc = lcNo?.trim() || null;
  const other = ai ?? (lc ? "LC" : null);
  // AI null = hồ sơ lưu trước khi có trường mã PTTT (không phân biệt được với AI để trống) → giữ kết quả regex, không bắt xem.
  if (!other || other === rxCode) return rx;
  const code = rxCode ?? other;
  const say = ai ? `AI nhận là ${ai}` : `có số L/C ${lc}`;
  const read = rxCode ? `hệ thống đọc ra ${rxCode}` : "hệ thống không nhận ra mã";
  const note = text ? `Chứng từ ghi “${text}”: ${read}, ${say} – chọn mã đúng` : `Chứng từ không ghi phương thức thanh toán, ${say} – chọn mã đúng`;
  return { code, name: paymentName(code), suspect: true, note: rxCode && rx!.note ? `${note}. ${rx!.note}` : note };
}

export type ResolvedPayment = { code: string; name: string; note?: string; suspect?: true };

/** Tên hiển thị theo mã – một nguồn cho mọi nhánh (regex, người khai chọn, mã AI / L/C); mã không có ở đây → nhãn PAYMENT_METHODS. */
const NAMES: Record<string, string> = {
  TTR: "Chuyển tiền bồi hoàn bằng điện", LC: "Tín dụng thư (L/C)", DA: "Nhờ thu chấp nhận chứng từ (D/A)", DP: "Nhờ thu kèm chứng từ (D/P)",
  CAD: "Trả tiền lấy chứng từ (CAD)", OA: "Mở tài khoản thanh toán (O/A)", CHEQUE: "Séc", CASH: "Tiền mặt", KHONGTT: "Không thanh toán",
  CANTRU: "Cấn trừ, bù trừ", KC: "Khác (bao gồm cả TT)",
};
const paymentName = (code: string) => NAMES[code] ?? PAYMENT_METHODS.find((p) => p.code === code)!.label;

/**
 * Phương thức thanh toán trên chứng từ → mã TK_IVP (chỉ tiêu 1.43 / 2.38, Phụ lục II TT39).
 * TTR là "chuyển tiền bồi hoàn bằng điện" (hoàn trả L/C), KHÔNG phải T/T thường: T/T, chuyển khoản → KC ("Khác, bao gồm cả TT")
 * và ghi phương thức thực tế vào chi tiết khai trị giá (1.50) / ghi chú (2.57). Không nhận ra → KC kèm nghi ngờ.
 */
export function resolvePayment(raw: string | null): ResolvedPayment | null {
  if (!raw) return null;
  // Đúng mã chuẩn (người khai chọn ở OCR): "LC" hoặc "KC – <phương thức thực tế>".
  const exact = parsePaymentChoice(raw);
  if (exact) return { code: exact.code, name: paymentName(exact.code) };
  const n = norm(raw);
  const hit = (code: string, note?: string): ResolvedPayment => ({ code, name: paymentName(code), ...(note ? { note } : {}) });
  const kcNote = (what: string) => `Mã KC gồm cả ${what} – ghi phương thức thực tế (“${raw.trim()}”) vào chi tiết khai trị giá / ghi chú`;
  if (/\bTTR\b|REIMBURSE/.test(n)) return hit("TTR");
  if (/\bL ?C\b|LETTER OF CREDIT/.test(n)) return hit("LC");
  if (/\bD ?A\b|DOCUMENTS? AGAINST ACCEPTANCE/.test(n)) return hit("DA");
  if (/\bD ?P\b|DOCUMENTS? AGAINST PAYMENT/.test(n)) return hit("DP");
  if (/\bCAD\b|CASH AGAINST DOCUMENTS?/.test(n)) return hit("CAD");
  if (/\bOA\b|OPEN ACCOUNT/.test(n)) return hit("OA");
  if (/\bCHEQUE\b|\bCHECK\b|\bSEC\b/.test(n)) return hit("CHEQUE");
  if (/\bCASH\b|TIEN MAT/.test(n)) return hit("CASH");
  if (/FREE OF CHARGE|\bFOC\b|NO COMMERCIAL VALUE|KHONG THANH TOAN|NO PAYMENT/.test(n)) return hit("KHONGTT");
  if (/NETTING|OFFSET|CAN TRU|BU TRU/.test(n)) return hit("CANTRU");
  if (/\bT ?T\b|TELEGRAPHIC|\bWIRE\b|BANK TRANSFER|REMITTANCE|CHUYEN KHOAN/.test(n)) return hit("KC", kcNote("T/T, chuyển khoản"));
  return { code: "KC", name: "Khác", suspect: true, note: `Không nhận ra phương thức thanh toán “${raw.trim()}” – chọn mã TK_IVP; nếu khai KC thì ghi phương thức thực tế vào chi tiết khai trị giá / ghi chú` };
}

