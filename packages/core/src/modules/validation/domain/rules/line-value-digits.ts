// Chỉ tiêu 1.85/2.74 – TT39 PL II: trị giá hóa đơn một dòng vượt 12 chữ số phần nguyên → tách thành nhiều dòng hàng.
import { dec } from "../../../../shared/decimal.js";
import { fail, fmt, intDigits, listSome, pass, skipped, type Rule } from "../helpers.js";

const MAX_INT = 12;

export const lineValueDigits: Rule = {
  code: "R-LINE-VALUE-DIGITS",
  title: "Trị giá dòng hàng tối đa 12 chữ số phần nguyên",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  run(s) {
    const rows = s.items.flatMap((it, index) => (it.amount.value !== null ? [{ it, index, a: dec(it.amount.value) }] : []));
    if (!rows.length) return skipped("Chưa có trị giá dòng hàng");
    const bad = rows.filter((r) => intDigits(r.a) > MAX_INT);
    if (!bad.length) return pass(`${rows.length} dòng: trị giá không quá ${MAX_INT} chữ số phần nguyên`);
    const lines = bad.map((r) => `Dòng ${r.it.lineNo}: ${fmt(r.a)} (${intDigits(r.a)} chữ số)`);
    return fail(
      `${listSome(lines)} – trị giá hóa đơn mỗi dòng tối đa ${MAX_INT} chữ số phần nguyên: tách dòng hàng sao cho tổng lượng các dòng bằng tổng lượng tờ khai (chỉ tiêu 1.85/2.74)`,
      bad.map((r) => `/items/${r.index}/amount`),
    );
  },
};
