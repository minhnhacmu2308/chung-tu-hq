// Chỉ tiêu 1.78/2.69 – TT39 PL II, TT121 Mẫu 02: mô tả hàng hóa tối đa 200 ký tự (VNACCS); hàng xuất còn 196 vì phải ghi "#&mã nước xuất xứ".
import { charLen, listSome, pass, skipped, warn, type Rule } from "../helpers.js";

const MAX_NK = 200;
const MAX_XK = 196;

export const descriptionLength: Rule = {
  code: "R-DESCRIPTION-LENGTH",
  title: "Mô tả hàng hóa không quá 200 ký tự",
  severity: "WARNING",
  docKinds: ["INVOICE"],
  run(s, ctx) {
    const xk = ctx.dossier?.direction === "XK";
    const max = xk ? MAX_XK : MAX_NK;
    const rows = s.items.flatMap((it, index) => (it.description.value ? [{ it, index, len: charLen(it.description.value) }] : []));
    if (!rows.length) return skipped("Chưa có mô tả dòng hàng");
    const bad = rows.filter((r) => r.len > max);
    const why = xk ? `${max} ký tự (200 trừ 4 ký tự "#&XX" mã nước xuất xứ – chỉ tiêu 2.69)` : `${max} ký tự (chỉ tiêu 1.78/2.69)`;
    if (!bad.length) return pass(`${rows.length} dòng: mô tả không quá ${why}`);
    return warn(`${listSome(bad.map((r) => `Dòng ${r.it.lineNo}: ${r.len} ký tự`))} – mô tả hàng hóa tối đa ${why}: rút gọn mô tả`, bad.map((r) => `/items/${r.index}/description`));
  },
};
