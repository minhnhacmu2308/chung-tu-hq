import { FREIGHT_TERM_REASON_LABELS, freightTermFit, incotermOf } from "@kb/contracts";
import { fail, pass, skipped, warn, type Rule } from "../helpers.js";

const TERM_LABEL = { PREPAID: "Freight Prepaid (người gửi trả cước)", COLLECT: "Freight Collect (người nhận trả cước)" } as const;

/**
 * Điều kiện giao hàng khớp người trả cước trên vận đơn: nhóm C/D (giá đã gồm cước) mà vận đơn ghi Collect → mâu thuẫn, chặn tới khi
 * sửa điều kiện giao hàng, khai cước hoặc người khai giải trình (charges.freightTermNote → cảnh báo); nhóm E/F mà ghi Prepaid → cảnh báo.
 */
export const freightTerm: Rule = {
  code: "R-FREIGHT-TERM",
  title: "Điều kiện giao hàng khớp người trả cước trên vận đơn",
  severity: "BLOCKER",
  docKinds: ["INVOICE", "BILL_OF_LADING"],
  run(s, ctx) {
    const code = incotermOf(s.invoice.incoterm.value);
    const term = s.transport.freightTerm?.value;
    if (!code) return skipped("Chưa đọc được điều kiện giao hàng");
    if (term !== "PREPAID" && term !== "COLLECT") return skipped("Vận đơn không ghi Freight Prepaid / Collect");
    const fields = ["/invoice/incoterm", "/transport/freightTerm"];
    const label = TERM_LABEL[term];
    const fit = freightTermFit(code, term);
    if (fit === "CONFLICT") {
      const n = ctx.charges?.freightTermNote;
      if (n) return warn(`${code} (người bán trả cước) nhưng vận đơn ghi ${label} – người khai giải trình “${FREIGHT_TERM_REASON_LABELS[n.reason]}${n.note ? `: ${n.note}` : ""}”`, fields);
      return fail(`${code}: giá đã gồm cước (người bán trả) nhưng vận đơn ghi ${label} – sửa điều kiện giao hàng cho đúng hóa đơn, khai cước, hoặc ghi lý do ở “Chi phí và điều chỉnh trị giá”`, fields);
    }
    if (fit === "CHECK") return warn(`${code}: người mua trả cước nhưng vận đơn ghi ${label} – người bán trả hộ thì vẫn phải khai cước theo điều kiện giao hàng`, fields);
    if (fit === "OK") return pass(`${code} khớp vận đơn ${label}`, fields);
    return skipped(`${code}: không xác định được bên trả cước theo điều kiện giao hàng này`);
  },
};
