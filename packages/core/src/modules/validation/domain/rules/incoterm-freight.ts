import { FREIGHT_REASON_LABELS } from "@kb/contracts";
import { fail, fmt, pass, skipped, warn, type Rule } from "../helpers.js";

const NEEDS_FREIGHT = ["EXW", "FCA", "FAS", "FOB"];

/** EXW/FCA/FAS/FOB phải có cước vận chuyển quốc tế để cộng vào trị giá tính thuế (PRODUCT §7.3). */
export const incotermFreight: Rule = {
  code: "R-INCOTERM-FREIGHT",
  title: "Cước vận chuyển để cộng trị giá theo Incoterm",
  severity: "BLOCKER",
  docKinds: ["INVOICE", "FREIGHT_INVOICE", "ARRIVAL_NOTICE"],
  directions: ["NK"], // cước chỉ cộng vào trị giá tính thuế hàng nhập
  run(s, ctx) {
    const term = s.invoice.incoterm.value?.slice(0, 3).toUpperCase();
    if (!term) return skipped("Chưa đọc được điều kiện giao hàng");
    if (!NEEDS_FREIGHT.includes(term)) return pass(`${term}: giá đã gồm cước, không cần cộng thêm`, ["/invoice/incoterm"]);
    const manual = ctx.charges?.freight;
    if (manual?.amount) return pass(`${term}: cước ${fmt(manual.amount)} ${manual.currency} người khai nhập sẽ cộng vào trị giá tính thuế`, ["/charges/freight"]);
    const freight = s.charges.freight.value;
    // Người khai ghi nhận lý do chưa có số cước → cảnh báo (được duyệt), bổ sung trước khi truyền.
    if (!freight && manual) return warn(`${term}: chưa có số cước – người khai ghi lý do “${FREIGHT_REASON_LABELS[manual.reason]}${manual.note ? `: ${manual.note}` : ""}”. Bổ sung số cước ở “Chi phí và điều chỉnh trị giá” trước khi truyền`, ["/charges/freight"]);
    if (!freight) return fail(`${term} cần cước vận chuyển quốc tế để cộng trị giá – chưa có hóa đơn cước / Arrival Notice – nhập số cước hoặc lý do ở “Chi phí và điều chỉnh trị giá”`, ["/invoice/incoterm", "/charges/freight"]);
    const kind = s.charges.freight.sources[0]?.kind === "ARRIVAL_NOTICE" ? "Arrival Notice" : "hóa đơn cước";
    return pass(`${term}: cước ${fmt(freight)} từ ${kind} sẽ cộng vào trị giá tính thuế`, ["/charges/freight"]);
  },
};
