// Tờ khai > 50 dòng hàng → các tờ khai nhánh: cắt dòng theo lineNo, tự điền 1.2 (TK_FIC/TK_BNO/TK_DNO) và 1.51 (TK_TP). Thuần.
import { Decimal } from "../../../shared/decimal.js";
import { branchRanges, isActiveSheet, sentSheetsCheck, sentSheetsReason, sentSnapshotOf, type BranchRange, type CustomsStage, type SentSnapshot } from "@kb/contracts";
import { reasonError, type DomainError } from "../../../shared/errors.js";
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
  const range = ranges.find((r) => r.no === no);
  // `no` ngoài 1..of (0, NaN, vượt số tờ): không lùi về tờ 1 (tránh gửi "tờ 1" hai lần) – chặn, không có dữ liệu dùng được.
  if (!range) return { payload: { ...p, items: [] }, range: { ...ranges[0]!, no, index: [0, 0] }, blockers: [`Tờ ${no}: không có trong lô (${ranges.length} tờ)`] };
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

export type { SentSnapshot };

/**
 * Ảnh chụp nội dung tờ `no` như được gửi Hải quan (spec §2.5): tính trên branchPayload (gồm TK_DNO, TK_TP tính cho tờ – đổi trị giá dòng làm đổi 1.51),
 * `common` bỏ TK_FIC/TK_BNO và ô HANG.*, cộng @ADJ/@CONT/@CUR; `lines` = dòng hàng của tờ + ô HANG.<id>.* của dòng.
 */
export function sheetSnapshot(p: DeclarationPayload, no: number): SentSnapshot {
  const b = branchPayload(p, no, null).payload;
  return sentSnapshotOf({ fields: Object.fromEntries(Object.entries(b.fields).map(([k, f]) => [k, f.value])), items: b.items, adjustments: b.adjustments, containers: b.containers, currency: b.currency });
}

export type SentSheet = { no: number; stage: CustomsStage; declarationNo: string | null; sent: SentSnapshot | null };

/** Tờ còn hiệu lực (có số, chưa gọi về, không miễn) CÓ ảnh chụp: chỉ tiêu chung khác (mã) và dòng hàng khác không. */
export function sentSheetsDiff(p: DeclarationPayload, sheets: SentSheet[]): { no: number; common: string[]; lines: boolean }[] {
  return sheets.filter((s) => s.sent && isActiveSheet(s)).map((s) => {
    const c = sentSheetsCheck([{ ...s, current: sheetSnapshot(p, s.no) }]).changed[0];
    return { no: s.no, common: c?.common ?? [], lines: c?.lines ?? false };
  });
}

/**
 * Lô nhiều tờ: tờ còn hiệu lực ở Hải quan mà nội dung hiện tại khác nội dung đã gửi → SENT_SHEETS_CHANGED (chặn duyệt + truyền, bất biến 7).
 * Tờ còn hiệu lực KHÔNG có ảnh chụp (gửi trước khi có tính năng) không kiểm được → SENT_SHEETS_UNVERIFIED (ưu tiên, phải gọi về). Lô một tờ: null.
 */
export function sentSheetsError(p: DeclarationPayload, sheets: SentSheet[]): DomainError | null {
  if (sheets.length <= 1) return null;
  const check = sentSheetsCheck(sheets.map((s) => ({ ...s, current: sheetSnapshot(p, s.no) })));
  const r = sentSheetsReason(p.kind, check);
  return r ? reasonError("BLOCKER_FAILED", r.reason, r.params, { changed: check.changed, unverified: check.unverified }) : null;
}
