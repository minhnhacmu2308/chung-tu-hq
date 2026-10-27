// Định dạng hiển thị kết quả phân loại HS (HSCodePro) trên màn "Xác nhận mã HS".
import type { HsCandidate, LineItemHsStatus } from "@kb/contracts";

/** Thuế suất DB lưu "10.000000" → hiện "10"; "7.50" → "7.5". */
export const trimRate = (v: string) => (v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v);

/** Mã VAT VNACCS "VK…" = hàng không chịu thuế GTGT (HSCodePro trả kèm `vat.rate` null). */
export const isVatExempt = (code: string | null | undefined) => !!code && /^VK/i.test(code);

/** "5% · 10%"; FTA ghi hiệp định "0% (ACFTA) · 10%"; chưa có thuế NK → "—"; VAT null + mã VK → `exemptLabel` ("Không chịu thuế"). */
export function formatTax(c: HsCandidate | null | undefined, exemptLabel?: string): string {
  if (!c || c.importRate === null) return "—";
  const imp = `${trimRate(c.importRate)}%${c.basis === "FTA" && c.agreement ? ` (${c.agreement})` : ""}`;
  const vat = c.vatRate !== null ? `${trimRate(c.vatRate)}%` : exemptLabel && isVatExempt(c.vatCode) ? exemptLabel : "—";
  return `${imp} · ${vat}`;
}

/** Tài liệu §5: tin cậy < 60% hoặc có cảnh báo → tô màu cảnh báo. */
export const hsTone = (confidence: number, warnings: string[]): "warning" | "neutral" => (confidence < 0.6 || warnings.length > 0 ? "warning" : "neutral");

/** Dòng đang chạy phía HSCodePro → màn tự làm mới. */
export const hsBusy = (s: LineItemHsStatus) => s === "queued" || s === "processing" || s === "answering";

/** Ô nhập tay: nhận "84834090" hoặc "8483.40.90" → "8483.40.90"; không đủ 8 số → null. */
export function normalizeHsInput(v: string): string | null {
  const d = v.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : null;
}

/** Thuế của mã đã xác nhận (dòng hàng): mã nhập tay ngoài biểu có thể chưa có thuế suất → "—"; hàng không chịu thuế GTGT → `vatExemptLabel`. */
export function formatRates(importDutyRate: string | undefined, vatRate: string | undefined, vatExemptLabel?: string): string {
  if (importDutyRate === undefined && vatRate === undefined && !vatExemptLabel) return "—";
  const vat = vatRate !== undefined ? `${trimRate(vatRate)}%` : vatExemptLabel ?? "—";
  return `${importDutyRate === undefined ? "—" : `${trimRate(importDutyRate)}%`} · ${vat}`;
}
