// Thông tin thuế tờ khai (thuần) cho tab "Theo dõi & nghiệp vụ": chỉ từ số liệu Hải quan đã trả, không tự đặt số.
import { pickMessages, type UiLocale } from "@kb/ui";
import { formatNumber } from "@/lib/format";
import { FORM_MESSAGES } from "./form.messages";
import type { FormValues } from "./form-state";

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

/** Số thuế / tỷ giá (chuỗi thập phân) → có phân tách hàng nghìn, giữ đủ phần lẻ; giá trị không phải số giữ nguyên. */
export const taxAmount = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? formatNumber(v, v.split(".")[1]?.length ?? 0) : v);
