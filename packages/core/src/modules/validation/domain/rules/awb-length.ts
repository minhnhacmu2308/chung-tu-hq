// Chỉ tiêu 1.26 – TT39 PL II: số AWB không được vượt quá 20 ký tự.
import { charLen, fail, pass, skipped, type Rule } from "../helpers.js";

const MAX_AWB = 20;

export const awbLength: Rule = {
  code: "R-AWB-LENGTH",
  title: "Số AWB không quá 20 ký tự",
  severity: "BLOCKER",
  docKinds: ["AIR_WAYBILL"],
  run(s, ctx) {
    const mode = ctx.dossier?.transportMode;
    if (!mode) return skipped("Chưa biết phương thức vận chuyển của hồ sơ");
    if (mode !== "AIR") return skipped("Không phải vận chuyển đường hàng không");
    const useHouse = !!s.transport.billNo.value;
    const bill = (s.transport.billNo.value ?? s.transport.masterBillNo.value)?.trim();
    if (!bill) return skipped("Chưa đọc được số AWB");
    const f = [useHouse ? "/transport/billNo" : "/transport/masterBillNo"];
    const len = charLen(bill);
    return len > MAX_AWB
      ? fail(`Số AWB '${bill}' có ${len} ký tự – chỉ tiêu 1.26: số AWB không quá ${MAX_AWB} ký tự`, f)
      : pass(`Số AWB '${bill}' có ${len} ký tự (tối đa ${MAX_AWB})`, f);
  },
};
