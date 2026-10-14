import { pass, skipped, warn, type Rule } from "../helpers.js";

/** Ngày invoice ≤ ngày hàng đến. */
export const dateOrder: Rule = {
  code: "R-DATE-ORDER",
  title: "Thứ tự ngày chứng từ hợp lý",
  severity: "WARNING",
  docKinds: ["INVOICE", "ARRIVAL_NOTICE"],
  run(s) {
    const inv = s.invoice.date.value;
    const arr = s.transport.arrivalDate.value;
    if (!inv || !arr) return skipped("Thiếu ngày invoice hoặc ngày hàng đến");
    return inv <= arr ? pass(`Invoice ${inv} trước ngày hàng đến ${arr}`, ["/invoice/date"]) : warn(`Invoice ${inv} sau ngày hàng đến ${arr} – kiểm tra lại ngày`, ["/invoice/date", "/transport/arrivalDate"]);
  },
};
