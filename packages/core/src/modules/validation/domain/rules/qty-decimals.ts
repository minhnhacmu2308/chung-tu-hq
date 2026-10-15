// Chỉ tiêu 1.83/2.72 – TT39 PL II: số lượng nhập đến 02 số thập phân; vượt → làm tròn, khai "mô tả#&số lượng" ở Mô tả hàng hóa, không khai đơn giá.
import { dec } from "../../../../shared/decimal.js";
import { decimals, fmt, listSome, pass, skipped, warn, type Rule } from "../helpers.js";

const MAX_DP = 2;

export const qtyDecimals: Rule = {
  code: "R-QTY-DECIMALS",
  title: "Số lượng tối đa 2 chữ số thập phân",
  severity: "WARNING",
  docKinds: ["INVOICE", "PACKING_LIST"],
  run(s) {
    const rows = s.items.flatMap((it, index) => (it.quantity.value !== null ? [{ it, index, q: dec(it.quantity.value) }] : []));
    if (!rows.length) return skipped("Chưa có số lượng dòng hàng");
    const bad = rows.filter((r) => decimals(r.q) > MAX_DP);
    if (!bad.length) return pass(`${rows.length} dòng: số lượng không quá ${MAX_DP} chữ số thập phân`);
    const lines = bad.map((r) => `Dòng ${r.it.lineNo}: ${fmt(r.q)}`);
    return warn(
      `${listSome(lines)} – Số lượng chỉ khai tối đa 2 chữ số thập phân: làm tròn, ghi 'mô tả#&số lượng thực tế' ở Mô tả hàng hóa và không khai đơn giá (chỉ tiêu 1.83/2.72)`,
      bad.map((r) => `/items/${r.index}/quantity`),
    );
  },
};
