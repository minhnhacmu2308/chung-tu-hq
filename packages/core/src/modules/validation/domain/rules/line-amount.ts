// Chỉ tiêu 1.86/2.75 – TT39 PL II: đơn giá hóa đơn × số lượng = trị giá hóa đơn ± 1.
import { dec } from "../../../../shared/decimal.js";
import { fmt, listSome, near, pass, skipped, warn, type Rule } from "../helpers.js";

export const lineAmount: Rule = {
  code: "R-LINE-AMOUNT",
  title: "Đơn giá × số lượng = trị giá dòng hàng (±1)",
  severity: "WARNING",
  docKinds: ["INVOICE"],
  run(s) {
    const rows = s.items.flatMap((it, index) => {
      const q = it.quantity.value, p = it.unitPrice.value, a = it.amount.value;
      return q !== null && p !== null && a !== null ? [{ it, index, q: dec(q), p: dec(p), a: dec(a) }] : [];
    });
    if (!rows.length) return skipped("Không có dòng hàng đủ số lượng, đơn giá và trị giá");
    const bad = rows.map((r) => ({ ...r, calc: r.q.times(r.p) })).filter((r) => !near(r.calc, r.a, { abs: "1" }));
    if (!bad.length) return pass(`${rows.length} dòng: đơn giá × số lượng = trị giá hóa đơn (sai số ±1)`);
    const lines = bad.map((r) => `Dòng ${r.it.lineNo}: ${fmt(r.q)} × ${fmt(r.p)} = ${fmt(r.calc)} ≠ ${fmt(r.a)}`);
    return warn(`${bad.length} dòng đơn giá × số lượng lệch trị giá quá ±1 (chỉ tiêu 1.86/2.75) – ${listSome(lines)}`, bad.map((r) => `/items/${r.index}/amount`));
  },
};
