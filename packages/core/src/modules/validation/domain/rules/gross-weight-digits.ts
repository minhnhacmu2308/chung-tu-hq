// Chỉ tiêu 1.28/2.26 – TT39 PL II: tổng trọng lượng đường không 8 số nguyên + 1 thập phân; phương thức khác 6 + 3; mã "9" không phải khai.
import { TRANSPORT_MODE_INFO } from "@kb/contracts";
import { dec } from "../../../../shared/decimal.js";
import { decimals, fail, fmt, intDigits, pass, skipped, warn, type Rule } from "../helpers.js";

export const grossWeightDigits: Rule = {
  code: "R-GROSS-WEIGHT-DIGITS",
  title: "Tổng trọng lượng đúng số chữ số theo phương thức vận chuyển",
  severity: "BLOCKER",
  docKinds: ["PACKING_LIST", "BILL_OF_LADING", "AIR_WAYBILL"],
  run(s, ctx) {
    const mode = ctx.dossier?.transportMode;
    if (!mode) return skipped("Chưa biết phương thức vận chuyển của hồ sơ");
    if (mode === "OTHER") return skipped(`Phương thức vận chuyển mã "9": không phải khai tổng trọng lượng`);
    const v = s.transport.grossWeightKg.value;
    if (v === null) return skipped("Chưa đọc được tổng trọng lượng");
    const air = mode === "AIR";
    const [maxInt, maxDp] = air ? [8, 1] : [6, 3];
    const label = TRANSPORT_MODE_INFO[mode].label.toLowerCase();
    const d = dec(v);
    const f = ["/transport/grossWeightKg"];
    const ints = intDigits(d), dps = decimals(d);
    if (ints > maxInt) return fail(`Tổng trọng lượng ${fmt(d, "kg")} có ${ints} chữ số phần nguyên – ${label} chỉ khai tối đa ${maxInt} (chỉ tiêu 1.28/2.26): kiểm tra lại số hoặc khai theo đơn vị TNE`, f);
    if (dps > maxDp) return warn(`Tổng trọng lượng ${fmt(d, "kg")} có ${dps} chữ số thập phân – ${label} chỉ khai tối đa ${maxDp}: làm tròn; hàng không ghi trọng lượng chính xác vào Phần ghi chú (chỉ tiêu 1.28/2.26)`, f);
    return pass(`Tổng trọng lượng ${fmt(d, "kg")} trong giới hạn ${maxInt} số nguyên + ${maxDp} thập phân (${label})`, f);
  },
};
