/** Chỉ giữ chữ số; MST hợp lệ 10 hoặc 13 chữ số, ngược lại null. */
export function normalizeTaxCode(s: string): string | null {
  const digits = s.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 13 ? digits : null;
}
