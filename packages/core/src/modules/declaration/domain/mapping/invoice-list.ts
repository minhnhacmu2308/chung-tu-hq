// Lô nhiều hóa đơn (ADR 0013 mục 3, chốt 2026-11-10): khai toàn bộ số + ngày hóa đơn lên tờ khai. Thuần, không AI.
// Ghi vào Phần ghi chú trước (≤ 100), hết chỗ ghi tiếp sang ô thứ hai: IDA 1.50 Chi tiết khai trị giá (≤ 280), EDA 2.32 Ký hiệu và số hiệu (≤ 140).
// Nội dung sẵn có của mỗi ô giữ nguyên, danh sách nối sau. Không đủ chỗ → đánh dấu nghi ngờ, gợi ý đính kèm danh sách qua HYS.
import type { Shipment } from "@kb/contracts";
import type { MappedValue, MappingInput } from "./types.js";

export type InvoiceRef = { no: string; date: string | null };
export type InvoiceSlot = { base: MappedValue; max: number; no: string };

/** Số + ngày từng hóa đơn theo thứ tự chứng từ của hồ sơ (một chứng từ INVOICE một số; trùng số chỉ lấy một lần). */
export function invoiceRefs(s: Shipment): InvoiceRef[] {
  const pick = (f: { sources: { documentId: string; kind: string; normalized?: string | undefined; raw: string }[] }, id: string) => {
    const x = f.sources.find((r) => r.kind === "INVOICE" && r.documentId === id);
    return x ? (x.normalized ?? x.raw).trim() || null : null;
  };
  const out: InvoiceRef[] = [];
  for (const d of s.documents.filter((x) => x.kind === "INVOICE")) {
    const no = pick(s.invoice.no, d.id);
    if (!no || out.some((r) => r.no === no)) continue;
    out.push({ no, date: pick(s.invoice.date, d.id) });
  }
  return out;
}

const vnDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const token = (r: InvoiceRef) => (r.date ? `${r.no} ${vnDate(r.date)}` : r.no);
/** Chữ không dấu: ô 2.32 VNACCS chỉ nhận chữ không dấu – dùng chung một dạng cho mọi ô. */
const HEAD = ["So HD: ", "So HD (tiep): "] as const;

const joinNote = (a: string | undefined, b: string) => (a ? `${a}; ${b}` : b);

/**
 * Rải danh sách số hóa đơn vào các ô theo thứ tự, giữ thứ tự hóa đơn; mỗi ô không vượt `max`.
 * Một hóa đơn trở xuống → trả nguyên các ô (số hóa đơn đã ở chỉ tiêu Số hóa đơn).
 */
export function spreadInvoiceList(i: MappingInput, slots: InvoiceSlot[]): MappedValue[] {
  const invoiceDocs = i.shipment.documents.filter((d) => d.kind === "INVOICE").length;
  if (invoiceDocs <= 1) return slots.map((s) => s.base);
  const refs = invoiceRefs(i.shipment);
  let next = 0;
  let segments = 0;
  const out = slots.map((slot): MappedValue => {
    const base = slot.base.value?.trim() || "";
    const head = HEAD[segments === 0 ? 0 : 1];
    const taken: string[] = [];
    // 1.50 mở đầu bằng "DDMMYYYY#&" (TT121) – nối thẳng sau dấu #&, không chèn "; ".
    const sep = !base || base.endsWith("#&") ? "" : "; ";
    const text = (list: string[]) => `${base}${sep}${head}${list.join(", ")}`;
    while (next < refs.length && text([...taken, token(refs[next]!)]).length <= slot.max) taken.push(token(refs[next++]!));
    if (!taken.length) return slot.base;
    segments++;
    return { ...slot.base, value: text(taken), source: base ? slot.base.source : "INVOICE", note: joinNote(slot.base.note, `Liệt kê ${taken.length} số hóa đơn của lô (${invoiceDocs} hóa đơn)`) };
  });
  const left = refs.length - next;
  const unread = invoiceDocs - refs.length;
  const problems = [
    left > 0 ? `Còn ${left} số hóa đơn không đủ chỗ (${slots.map((s) => `${s.no} ≤ ${s.max}`).join(", ")} ký tự) – đính kèm danh sách hóa đơn qua HYS` : null,
    unread > 0 ? `${unread} hóa đơn chưa đọc được số – bổ sung số hóa đơn ở bước OCR & kiểm tra` : null,
  ].filter((x): x is string => !!x);
  if (problems.length) out[0] = { ...out[0]!, suspect: true, note: joinNote(out[0]!.note, problems.join("; ")) };
  return out;
}
