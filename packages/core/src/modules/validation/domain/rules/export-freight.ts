import { FREIGHT_REASON_LABELS, incotermIncludesFreight, incotermOf, isDomesticDelivery } from "@kb/contracts";
import { fail, fmt, pass, skipped, warn, type Rule } from "../helpers.js";

/**
 * C&I chỉ gồm bảo hiểm, không gồm cước. Mọi điều kiện nhóm C, D khác (kể cả DAP, DAF) phải trừ cước.
 * Cùng quy tắc với declaration/domain/adjustments.ts `freightRequired("EDA", …)`.
 */
const NO_DEDUCTION = new Set(["C&I"]);

/**
 * Tờ khai xuất: trị giá tính thuế là giá tại cửa khẩu xuất, không gồm cước quốc tế (TT39 Điều 7; chỉ tiêu 2.40). Giá nhóm C/D đã gồm cước
 * → phải có số cước để trừ ra; thiếu thì 2.40 sai (cao hơn thực tế).
 */
export const exportFreight: Rule = {
  code: "R-EXPORT-FREIGHT-DEDUCT",
  title: "Cước vận chuyển để trừ khỏi trị giá hàng xuất theo Incoterm",
  severity: "BLOCKER",
  docKinds: ["INVOICE", "FREIGHT_INVOICE", "BILL_OF_LADING"],
  directions: ["XK"], // tờ khai nhập cộng cước – xem R-INCOTERM-FREIGHT
  run(s, ctx) {
    const term = incotermOf(s.invoice.incoterm.value);
    if (!term) return skipped("Chưa đọc được điều kiện giao hàng");
    if (isDomesticDelivery(ctx.dossier?.transportMode)) return pass(`${term} – phương thức vận chuyển 9 (giao hàng tại chỗ, trong nước): không có cước quốc tế để trừ`, ["/invoice/incoterm"]);
    if (!incotermIncludesFreight(term) || NO_DEDUCTION.has(term)) return pass(`${term}: không phải trừ cước khỏi trị giá tính thuế xuất khẩu`, ["/invoice/incoterm"]);
    const manual = ctx.charges?.freight;
    if (manual?.amount) return pass(`${term}: cước ${fmt(manual.amount)} ${manual.currency} người khai nhập sẽ trừ khỏi giá hóa đơn (chỉ tiêu 2.40)`, ["/charges/freight"]);
    const freight = s.charges.freight.value;
    if (freight) return pass(`${term}: cước ${fmt(freight)} trên chứng từ sẽ trừ khỏi giá hóa đơn (chỉ tiêu 2.40)`, ["/charges/freight"]);
    if (manual) return warn(`${term}: chưa có số cước để trừ – người khai ghi lý do “${FREIGHT_REASON_LABELS[manual.reason]}${manual.note ? `: ${manual.note}` : ""}”. Bổ sung số cước trước khi truyền`, ["/charges/freight"]);
    return fail(`${term}: giá hóa đơn đã gồm cước quốc tế – cần số cước để trừ ra khi tính trị giá tính thuế xuất khẩu (2.40). Nhập số cước hoặc lý do ở “Chi phí và điều chỉnh trị giá”`, ["/invoice/incoterm", "/charges/freight"]);
  },
};
