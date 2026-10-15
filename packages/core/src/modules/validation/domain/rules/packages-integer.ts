// Chỉ tiêu 1.27/2.25 – TT39 PL II: số lượng kiện không nhập phần thập phân; hàng không thể hiện bằng kiện nhập "1".
import { dec } from "../../../../shared/decimal.js";
import { fail, fmt, pass, skipped, type Rule } from "../helpers.js";

export const packagesInteger: Rule = {
  code: "R-PACKAGES-INTEGER",
  title: "Số lượng kiện là số nguyên dương",
  severity: "BLOCKER",
  docKinds: ["PACKING_LIST", "BILL_OF_LADING", "AIR_WAYBILL"],
  run(s) {
    const v = s.transport.packages.value;
    if (v === null) return skipped("Chưa đọc được số lượng kiện");
    const d = dec(v);
    if (d.isInteger() && d.gt(0)) return pass(`Số lượng kiện ${fmt(d)} là số nguyên dương`, ["/transport/packages"]);
    return fail(`Số lượng kiện ${fmt(d)} – chỉ tiêu 1.27/2.25 chỉ nhận số nguyên dương (không nhập phần thập phân; hàng không đếm được theo kiện khai "1")`, ["/transport/packages"]);
  },
};
