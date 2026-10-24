// Quy tắc hiển thị theo giai đoạn tờ khai (thuần). Căn cứ: màn hình tạo mới của phần mềm khai báo (CHITIEU_NHAPKHAU_TAOMOI / CHITIEU_XUATKHAU_TAOMOI)
// – nháp chỉ có ô người khai nhập, chưa có kết quả Hải quan; sau khi đăng ký, phần người khai chỉ đọc, sửa qua khai sửa đổi bổ sung.
import type { DeclarationLayout, LayoutField } from "@kb/contracts";
import { pickMessages, type UiLocale } from "@kb/ui";
import { formatNumber } from "@/lib/format";
import { FORM_MESSAGES } from "./form.messages";
import type { Stage } from "./fixtures";
import type { FormValues } from "./form-state";

/** Nháp: sửa tự do. Đã khai: chỉ sửa khi đang khai sửa đổi bổ sung (IDA01/EDA01). Đã thông quan: chỉ đọc (sửa sau thông quan qua AMA). */
export const declarantEditable = (stage: Stage, amending: boolean) => stage === "nhap" || (stage === "da-khai" && amending);

/** Đầu trang: nháp chỉ còn ô số tờ khai (chưa có); phân luồng, thông quan, ngày đăng ký chỉ có sau khi khai. */
export const summaryAt = (layout: DeclarationLayout, stage: Stage): LayoutField[] => (stage === "nhap" ? layout.summary.slice(0, 1) : layout.summary);

type Msg = keyof (typeof FORM_MESSAGES)["vi"];
const OPERATIONS: Msg[] = ["opHys", "opAma", "opContainerDecl", "opContainerGet", "opExtraDocs", "opCancel"];
/** Nghiệp vụ cần tờ khai đã có số. */
const AFTER_DECLARED = new Set<Msg>(["opAma", "opContainerGet", "opCancel"]);
const LOOKUPS: Msg[] = ["lkStatus", "lkTaxDebt", "lkTaxPaid", "lkBarcode", "lkChannel"];

/** Nhãn nghiệp vụ bổ sung theo giai đoạn (theo ngôn ngữ giao diện). */
export const operationsAt = (stage: Stage, locale: UiLocale): string[] => {
  const t = pickMessages(FORM_MESSAGES, locale);
  return (stage === "nhap" ? OPERATIONS.filter((o) => !AFTER_DECLARED.has(o)) : OPERATIONS).map((k) => t[k]);
};
export const lookupsAt = (stage: Stage, locale: UiLocale): string[] => {
  const t = pickMessages(FORM_MESSAGES, locale);
  return stage === "nhap" ? [] : LOOKUPS.map((k) => t[k]);
};

export type TaxSummary = { rate: { currency: string; value: string } | null; lines: { label: string; value: string }[]; total: string | null };

/** Thông tin thuế tờ khai (tab Quản lý tờ khai của phần mềm) – chỉ từ số liệu Hải quan đã trả; chưa có → null, không tự đặt số. */
export function taxSummary(kind: "IDA" | "EDA", v: FormValues, locale: UiLocale): TaxSummary | null {
  const val = (k: string) => v[k]?.trim() ?? "";
  if (kind === "IDA") {
    const lines = [1, 2, 3, 4, 5, 6].filter((n) => val(`THUE_KH${n}`)).map((n) => ({ label: val(`THUE_KG${n}`) || val(`THUE_KF${n}`), value: val(`THUE_KH${n}`) }));
    if (!lines.length && !val("THUE_B02")) return null;
    return { rate: val("THUE_KK1") ? { currency: val("THUE_KJ1"), value: val("THUE_KK1") } : null, lines, total: val("THUE_B02") || null };
  }
  if (!val("TK_ETA")) return null;
  return { rate: val("TK_RD1") ? { currency: val("TK_RC1"), value: val("TK_RD1") } : null, lines: [{ label: pickMessages(FORM_MESSAGES, locale).exportTax, value: val("TK_ETA") }], total: null };
}

type Snapshot = { header: FormValues; items: FormValues[] };
const diff = (a: FormValues, b: FormValues) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? "") !== (b[k] ?? "")).length;

/** Số ô đã sửa so với tờ khai đã đăng ký (phần đầu + từng dòng hàng) – hiện khi khai sửa đổi bổ sung. */
export const changedCount = (before: Snapshot, after: Snapshot) =>
  diff(before.header, after.header) + after.items.reduce((n, it, i) => n + diff(before.items[i] ?? {}, it), 0);

/** Số thuế / tỷ giá (chuỗi thập phân) → có phân tách hàng nghìn, giữ đủ phần lẻ; giá trị không phải số giữ nguyên. */
export const taxAmount = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? formatNumber(v, v.split(".")[1]?.length ?? 0) : v);
