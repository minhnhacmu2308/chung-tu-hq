// Lỗi Hải quan/FPT của lần gửi bị từ chối → chỉ tiêu Phụ lục II (thuần): để màn Review gắn lỗi vào đúng ô người khai cần sửa.
import { fieldDefForFptIndex, type CustomsRejection } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { CUSTOMS_ERROR_MESSAGES } from "./customs-errors.messages";

export type FieldError = {
  /** Số chỉ tiêu ("1.22"); không xác định được từ mã lỗi → undefined (chỉ hiện ở khung tổng hợp). */
  no?: string;
  label?: string;
  line?: number;
  code: string;
  message: string;
  solution?: string;
};

export function fieldErrors(kind: "IDA" | "EDA", rejection: CustomsRejection | null | undefined): FieldError[] {
  if (!rejection) return [];
  return rejection.errors.map((e) => {
    const def = fieldDefForFptIndex(kind, e.field);
    return { code: e.code, message: e.message, ...(e.solution ? { solution: e.solution } : {}), ...(e.line ? { line: e.line } : {}), ...(def ? { no: def.no, label: def.label } : {}) };
  });
}

/** Lỗi cấp tờ khai của một chỉ tiêu (lỗi theo dòng hàng hiện ở khung tổng hợp, không gắn vào ô thông tin chung). */
export const errorsForField = (errors: FieldError[], no: string | undefined) => (no ? errors.filter((e) => e.no === no && e.line === undefined) : []);

/** "1.22 · Địa chỉ" / "Dòng 2 · 1.74 Mã số hàng hóa" / "Mã lỗi E1004" – nơi lỗi xảy ra, để người khai tìm ô cần sửa. */
export function errorPlace(e: FieldError, locale: UiLocale = "vi"): string {
  const t = pickMessages(CUSTOMS_ERROR_MESSAGES, locale);
  const field = e.no ? `${e.no} · ${e.label ?? ""}`.trim() : null;
  if (e.line !== undefined) return field ? fill(t.lineField, { line: e.line, field }) : fill(t.line, { line: e.line });
  return field ?? fill(t.code, { code: e.code });
}
