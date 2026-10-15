// Định dạng hiển thị kết quả phân loại HS (HSCodePro) trên màn "Xác nhận mã HS".
import type { HsCandidate, LineItemHsStatus } from "@kb/contracts";

/** "5% · 10%"; FTA ghi hiệp định "0% (ACFTA) · 10%"; chưa có thuế NK → "—". */
export function formatTax(c: HsCandidate | null | undefined): string {
  if (!c || c.importRate === null) return "—";
  const imp = `${c.importRate}%${c.basis === "FTA" && c.agreement ? ` (${c.agreement})` : ""}`;
  return `${imp} · ${c.vatRate === null ? "—" : `${c.vatRate}%`}`;
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

/** Thuế của mã đã xác nhận (dòng hàng): mã nhập tay ngoài biểu có thể chưa có thuế suất → "—". */
export function formatRates(importDutyRate: string | undefined, vatRate: string | undefined): string {
  if (importDutyRate === undefined && vatRate === undefined) return "—";
  return `${importDutyRate === undefined ? "—" : `${importDutyRate}%`} · ${vatRate === undefined ? "—" : `${vatRate}%`}`;
}
