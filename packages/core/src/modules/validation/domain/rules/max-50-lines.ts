// Chỉ tiêu 1.2/2.2 – TT39 PL II: lô hàng nhiều hơn 50 dòng hàng phải tách tờ khai (tờ đầu "F", tờ sau khai số tờ khai đầu tiên).
import { fail, pass, skipped, type Rule } from "../helpers.js";

const MAX_LINES = 50;

export const max50Lines: Rule = {
  code: "R-MAX-50-LINES",
  title: "Tối đa 50 dòng hàng mỗi tờ khai",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  run(s) {
    const n = s.items.length;
    if (!n) return skipped("Chưa có dòng hàng");
    if (n <= MAX_LINES) return pass(`${n} dòng hàng – trong giới hạn ${MAX_LINES} dòng/tờ khai`, ["/items"]);
    const sheets = Math.ceil(n / MAX_LINES);
    return fail(`Lô hàng có ${n} dòng hàng – mỗi tờ khai tối đa ${MAX_LINES} dòng: tách ${sheets} tờ khai (tờ đầu khai "F" ở chỉ tiêu 1.2/2.2, tờ sau khai số tờ khai đầu tiên)`, ["/items"]);
  },
};
