import { fail, fmt, pass, skipped, type Rule } from "../helpers.js";

const NEEDS_FREIGHT = ["EXW", "FCA", "FAS", "FOB"];

/** EXW/FCA/FAS/FOB phải có cước vận chuyển quốc tế để cộng vào trị giá tính thuế (PRODUCT §7.3). */
export const incotermFreight: Rule = {
  code: "R-INCOTERM-FREIGHT",
  title: "Cước vận chuyển để cộng trị giá theo Incoterm",
  severity: "BLOCKER",
  docKinds: ["INVOICE", "FREIGHT_INVOICE", "ARRIVAL_NOTICE"],
  run(s) {
    const term = s.invoice.incoterm.value?.slice(0, 3).toUpperCase();
    if (!term) return skipped("Chưa đọc được điều kiện giao hàng");
    if (!NEEDS_FREIGHT.includes(term)) return pass(`${term}: giá đã gồm cước, không cần cộng thêm`, ["/invoice/incoterm"]);
    const freight = s.charges.freight.value;
    if (!freight) return fail(`${term} cần cước vận chuyển quốc tế để cộng trị giá – chưa có hóa đơn cước / Arrival Notice`, ["/invoice/incoterm", "/charges/freight"]);
    const kind = s.charges.freight.sources[0]?.kind === "ARRIVAL_NOTICE" ? "Arrival Notice" : "hóa đơn cước";
    return pass(`${term}: cước ${fmt(freight)} từ ${kind} sẽ cộng vào trị giá tính thuế`, ["/charges/freight"]);
  },
};
