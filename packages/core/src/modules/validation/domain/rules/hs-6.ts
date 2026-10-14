import { pass, skipped, type Rule } from "../helpers.js";

/** HS trên invoice nước ngoài chỉ tham khảo 6 số đầu; HS 8 số theo biểu VN phải được người xác nhận. */
export const hs6: Rule = {
  code: "R-HS-6",
  title: "Mã HS trên invoice chỉ tham khảo 6 số",
  severity: "INFO",
  docKinds: ["INVOICE"],
  run(s) {
    const withHs = s.items.filter((i) => i.hsOnInvoice.value);
    if (!withHs.length) return skipped("Invoice không ghi mã HS");
    return pass(`${withHs.length} dòng có HS trên invoice – chỉ dùng 6 số đầu để tham khảo, mã 8 số theo biểu Việt Nam cần người xác nhận`, withHs.map((_, i) => `/items/${i}/hsOnInvoice`));
  },
};
