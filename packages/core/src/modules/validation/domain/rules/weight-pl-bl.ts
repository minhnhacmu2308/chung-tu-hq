import { dec } from "../../../../shared/decimal.js";
import { fail, fmt, near, pass, valueOf, skipped, type Rule } from "../helpers.js";

/** Trọng lượng cả bì Packing List ≈ vận đơn (sai số 0,1% hoặc 0,1 kg – Hải quan đối chiếu gần như tuyệt đối). */
export const weightPlBl: Rule = {
  code: "R-WEIGHT-PL-BL",
  title: "Trọng lượng Packing List khớp vận đơn",
  severity: "BLOCKER",
  docKinds: ["PACKING_LIST", "BILL_OF_LADING", "AIR_WAYBILL"],
  run(s) {
    const gw = s.transport.grossWeightKg;
    const pl = valueOf(gw, "PACKING_LIST");
    const bl = valueOf(gw, "BILL_OF_LADING") ?? valueOf(gw, "AIR_WAYBILL");
    if (!pl || !bl) return skipped("Thiếu trọng lượng trên Packing List hoặc vận đơn");
    return near(dec(pl), dec(bl), { abs: "0.1", rel: "0.001" })
      ? pass(`Packing List ${fmt(pl, "kg")} ≈ vận đơn ${fmt(bl, "kg")}`, ["/transport/grossWeightKg"])
      : fail(`Packing List ${fmt(pl, "kg")} ≠ vận đơn ${fmt(bl, "kg")} (lệch ${fmt(dec(pl).minus(dec(bl)).abs(), "kg")})`, ["/transport/grossWeightKg"]);
  },
};
