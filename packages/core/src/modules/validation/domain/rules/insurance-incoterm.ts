// Chỉ tiêu 1.48 – TT39 PL II: điều kiện CIF, CIP, C&I, DDU, DDP, DAP, DAF, DAT đã gồm bảo hiểm → không nhập được phí bảo hiểm.
import { fmt, pass, skipped, warn, type Rule } from "../helpers.js";
import { normalizeIncoterm } from "./incoterm-code.js";

const INCLUDES_INSURANCE = ["CIF", "CIP", "C&I", "DDU", "DDP", "DAP", "DAF", "DAT"];

export const insuranceIncoterm: Rule = {
  code: "R-INSURANCE-INCOTERM",
  title: "Phí bảo hiểm phù hợp điều kiện giao hàng",
  severity: "WARNING",
  docKinds: ["INVOICE"],
  directions: ["NK"], // phí bảo hiểm chỉ cộng vào trị giá tính thuế hàng nhập
  run(s) {
    const ins = s.charges.insurance.value;
    if (ins === null) return skipped("Không có phí bảo hiểm riêng");
    const raw = s.invoice.incoterm.value?.trim();
    if (!raw) return skipped("Chưa đọc được điều kiện giao hàng");
    const term = normalizeIncoterm(raw);
    const cur = s.charges.insuranceCurrency?.value ?? s.invoice.currency.value ?? "";
    if (INCLUDES_INSURANCE.includes(term)) {
      return warn(`Điều kiện ${term} đã gồm phí bảo hiểm – không khai chỉ tiêu 1.48, không cộng thêm vào trị giá tính thuế (đang có phí bảo hiểm ${fmt(ins, cur)})`, ["/charges/insurance", "/invoice/incoterm"]);
    }
    return pass(`Phí bảo hiểm ${fmt(ins, cur)} cộng vào trị giá (1.48)`, ["/charges/insurance"]);
  },
};
