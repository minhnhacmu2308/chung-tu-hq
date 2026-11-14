// Gộp dòng hàng giống nhau khi hồ sơ bật mergeIdenticalLines (người khai đồng ý ở bước OCR; tách lại = tắt cờ, gộp lại shipment).
// Dòng gộp giữ số dòng + nguồn của dòng đầu nhóm (khóa trường item.N.* của các dòng khác không bị lệch); số lượng, thành tiền cộng bằng Decimal.
import { identicalLineGroups, type Shipment, type ShipmentItem, type Sourced } from "@kb/contracts";
import { sumDec, toDecimalString } from "../../../shared/decimal.js";
import { ITEM_SPECS } from "./shipment-spec.js";

/** Nhãn ghi chú của số lượng / thành tiền dòng gộp – remerge dựa vào đây để biết dòng nào vừa được tách ra. */
export const MERGED_NOTE_PREFIX = "Gộp dòng";
export const isMergedLine = (it: ShipmentItem) => !!(it.quantity.note?.startsWith(MERGED_NOTE_PREFIX) || it.amount.note?.startsWith(MERGED_NOTE_PREFIX));

/** Giá trị người khai đã xác nhận theo dòng (`item.N.<key>` USER_CONFIRMED) – chỉ dùng để XÉT NHÓM, không ghi vào shipment. */
export type ConfirmedItemValues = Map<number, Partial<Record<(typeof ITEM_SPECS)[number]["field"], string>>>;
export function confirmedItemValues(confirmed: readonly { key: string; value: string }[]): ConfirmedItemValues {
  const out: ConfirmedItemValues = new Map();
  for (const c of confirmed) {
    const m = /^item\.(\d+)\.(.+)$/.exec(c.key);
    const spec = m && ITEM_SPECS.find((x) => x.key === m[2]);
    if (spec) out.set(Number(m[1]), { ...out.get(Number(m[1])), [spec.field]: c.value });
  }
  return out;
}

const sum = (items: ShipmentItem[], f: "quantity" | "amount", note: string, confirmed: ConfirmedItemValues): Sourced<string> => {
  // Cộng theo giá trị người khai thấy: số đã sửa ở từng dòng thắng số AI đọc.
  const vals = items.map((it) => confirmed.get(it.lineNo)?.[f] ?? it[f].value);
  // Thiếu một giá trị thì không cộng được – giữ nguyên dòng đầu, người khai thấy ghi chú.
  if (vals.some((v) => v === null)) return { ...items[0]![f], note: `${note} – thiếu ${f === "quantity" ? "số lượng" : "thành tiền"} ở một dòng, chưa cộng` };
  return { ...items[0]![f], value: toDecimalString(sumDec(vals as string[])), note };
};

/**
 * Gộp nhóm dòng giống nhau theo giá trị người khai thấy (`confirmed` đè giá trị AI khi xét nhóm – vd xuất xứ tự chọn khác nhau thì không gộp).
 * Trả số dòng đầu các nhóm đã gộp.
 */
export function mergeIdenticalLines(s: Shipment, confirmed: ConfirmedItemValues = new Map()): number[] {
  const v = (it: ShipmentItem, f: (typeof ITEM_SPECS)[number]["field"]) => confirmed.get(it.lineNo)?.[f] ?? it[f]?.value ?? null;
  const groups = identicalLineGroups(s.items.map((it) => ({ lineNo: it.lineNo, description: v(it, "description"), unit: v(it, "unit"), unitPrice: v(it, "unitPrice"), origin: v(it, "origin"), hs: v(it, "hsOnInvoice"), partNo: v(it, "partNo") })));
  if (!groups.length) return [];
  const byNo = new Map(s.items.map((it) => [it.lineNo, it]));
  const absorbed = new Set<number>();
  for (const g of groups) {
    const items = g.map((n) => byNo.get(n)!);
    const note = `${MERGED_NOTE_PREFIX} ${g.join(", ")}`;
    const head = items[0]!;
    byNo.set(head.lineNo, { ...head, quantity: sum(items, "quantity", note, confirmed), amount: sum(items, "amount", note, confirmed) });
    g.slice(1).forEach((n) => absorbed.add(n));
  }
  s.items = s.items.filter((it) => !absorbed.has(it.lineNo)).map((it) => byNo.get(it.lineNo)!);
  return groups.map((g) => g[0]!);
}
