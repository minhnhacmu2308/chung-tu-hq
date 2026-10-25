// Chỉ tiêu 1.2/2.2 – TT39 PL II: lô hàng nhiều hơn 50 dòng được hệ thống tự tách tờ khai nhánh (tờ đầu "F", tờ sau khai số tờ khai đầu tiên) → chỉ thông báo.
import { BRANCH_MAX_LINES, branchRanges } from "@kb/contracts";
import { pass, skipped, type Rule } from "../helpers.js";

export const max50Lines: Rule = {
  code: "R-MAX-50-LINES",
  title: "Tối đa 50 dòng hàng mỗi tờ khai",
  severity: "INFO",
  docKinds: ["INVOICE"],
  run(s) {
    const n = s.items.length;
    if (!n) return skipped("Chưa có dòng hàng");
    if (n <= BRANCH_MAX_LINES) return pass(`${n} dòng hàng – trong giới hạn ${BRANCH_MAX_LINES} dòng/tờ khai`, ["/items"]);
    const ranges = branchRanges(s.items.map((_, k) => k + 1));
    return pass(`Lô hàng có ${n} dòng hàng – sẽ khai ${ranges.length} tờ khai (${ranges.map((r) => r.index[1] - r.index[0]).join("/")})`, ["/items"]);
  },
};
