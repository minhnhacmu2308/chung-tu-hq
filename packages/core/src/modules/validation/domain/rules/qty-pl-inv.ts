import { dec } from "../../../../shared/decimal.js";
import { fail, fmt, pass, valueOf, skipped, type Rule } from "../helpers.js";

/** Số kiện Packing List = vận đơn. */
export const qtyPlInv: Rule = {
  code: "R-QTY-PL-INV",
  title: "Số kiện Packing List khớp vận đơn",
  severity: "BLOCKER",
  docKinds: ["PACKING_LIST", "BILL_OF_LADING", "AIR_WAYBILL"],
  run(s) {
    const p = s.transport.packages;
    const pl = valueOf(p, "PACKING_LIST");
    const bl = valueOf(p, "BILL_OF_LADING") ?? valueOf(p, "AIR_WAYBILL");
    if (!pl || !bl) return skipped("Thiếu số kiện trên Packing List hoặc vận đơn");
    return dec(pl).eq(dec(bl)) ? pass(`Packing List ${fmt(pl)} kiện = vận đơn ${fmt(bl)} kiện`, ["/transport/packages"]) : fail(`Packing List ${fmt(pl)} kiện ≠ vận đơn ${fmt(bl)} kiện`, ["/transport/packages"]);
  },
};
