// Dữ liệu bắt buộc trước khi rời bước Đọc chứng từ (server chặn, giao diện khóa nút): xuất xứ từng dòng hàng, mã PTTT nhận ra được.
import { paymentNeedsChoice, type ReasonCode, type ReasonParams, type Shipment } from "@kb/contracts";

export function ocrExitBlockers(s: Shipment): { reason: ReasonCode; params?: ReasonParams }[] {
  const out: { reason: ReasonCode; params?: ReasonParams }[] = [];
  const noOrigin = s.items.filter((it) => !it.origin.value?.trim()).map((it) => it.lineNo);
  if (noOrigin.length) out.push({ reason: "ITEM_ORIGIN_MISSING", params: { lines: noOrigin.join(", ") } });
  const pay = s.invoice.paymentTerms.value;
  if (paymentNeedsChoice(pay)) out.push({ reason: "PAYMENT_METHOD_UNKNOWN", params: { raw: pay!.trim() } });
  return out;
}
