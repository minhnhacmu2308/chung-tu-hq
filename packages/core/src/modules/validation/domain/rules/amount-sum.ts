import { dec, sumDec } from "../../../../shared/decimal.js";
import { fail, fmt, near, pass, skipped, type Rule } from "../helpers.js";

/** Tổng trị giá invoice phải bằng tổng thành tiền các dòng (sai số 0,01). */
export const amountSum: Rule = {
  code: "R-AMOUNT-SUM",
  title: "Tổng trị giá invoice = Σ thành tiền dòng hàng",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  run(s) {
    const total = s.invoice.totalAmount.value;
    const amounts = s.items.map((i) => i.amount.value).filter((v): v is string => v !== null);
    if (!total || !amounts.length) return skipped("Thiếu tổng trị giá hoặc chưa có dòng hàng");
    const sum = sumDec(amounts);
    const cur = s.invoice.currency.value ?? "";
    return near(dec(total), sum, { abs: "0.01" })
      ? pass(`Tổng invoice ${fmt(total, cur)} = Σ ${amounts.length} dòng ${fmt(sum, cur)}`, ["/invoice/totalAmount"])
      : fail(`Tổng invoice ${fmt(total, cur)} ≠ Σ ${amounts.length} dòng ${fmt(sum, cur)} (lệch ${fmt(dec(total).minus(sum).abs(), cur)})`, ["/invoice/totalAmount"]);
  },
};
