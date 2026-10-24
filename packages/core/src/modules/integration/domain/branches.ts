// Tờ khai > 50 dòng hàng → các tờ khai nhánh: cắt dòng theo lineNo, tự điền 1.2 (TK_FIC/TK_BNO/TK_DNO) và 1.51 (TK_TP). Thuần.
import { Decimal } from "../../../shared/decimal.js";
import { branchRanges, type BranchRange } from "@kb/contracts";
import type { DeclarationPayload } from "./declaration-to-fpt.js";

/** Tổng trị giá hóa đơn cả lô (cộng `amount` các dòng) – chuỗi Decimal. */
export const invoiceTotal = (p: DeclarationPayload): string => p.items.reduce((s, it) => s.plus(it.amount || "0"), new Decimal(0)).toFixed();

/**
 * Tờ khai nhánh `no` của lô. Lô ≤ 50 dòng trả nguyên payload (không thêm chỉ tiêu).
 * Mọi chỉ tiêu khác giống hệt giữa các tờ; TK_FIC: tờ 1 = "F", tờ sau = số tờ khai của tờ 1; TK_TP = tổng trị giá hóa đơn cả lô (giữ nếu người khai đã nhập).
 */
export function branchPayload(p: DeclarationPayload, no: number, firstDeclarationNo: string | null): { payload: DeclarationPayload; range: BranchRange; blockers: string[] } {
  const sorted = [...p.items].sort((a, b) => a.lineNo - b.lineNo);
  const ranges = branchRanges(sorted.map((i) => i.lineNo));
  const range = ranges.find((r) => r.no === no) ?? ranges[0]!;
  if (range.of === 1) return { payload: p, range, blockers: [] };
  const blockers = range.no > 1 && !firstDeclarationNo ? [`Tờ ${range.no}/${range.of}: chưa có số tờ khai đầu tiên (tờ 1)`] : [];
  const tp = p.fields.TK_TP;
  const fields: DeclarationPayload["fields"] = {
    ...p.fields,
    TK_FIC: { value: range.no === 1 ? "F" : firstDeclarationNo ?? "" },
    TK_BNO: { value: String(range.no) },
    TK_DNO: { value: String(range.of) },
    TK_TP: tp?.source === "USER" && tp.value.trim() ? tp : { value: invoiceTotal(p) },
  };
  return { payload: { ...p, fields, items: sorted.slice(range.index[0], range.index[1]) }, range, blockers };
}
