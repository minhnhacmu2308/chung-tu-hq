// Thành tiền dòng / tổng invoice của dữ liệu nhập tay – cùng quy tắc backend (extraction/domain/manual.ts: làm tròn 2 số lẻ từng dòng, tổng = Σ dòng).
import { mulDecimal, sumDecimal } from "@/lib/decimal";

const DEC = /^-?\d+(\.\d+)?$/;
export const lineAmount = (quantity: string, unitPrice: string): string | null => (DEC.test(quantity.trim()) && DEC.test(unitPrice.trim()) ? mulDecimal(quantity, unitPrice, 2) : null);
export const manualTotal = (items: readonly { quantity: string; unitPrice: string }[]): string =>
  sumDecimal(items.map((it) => lineAmount(it.quantity, it.unitPrice) ?? "0"), 2);
