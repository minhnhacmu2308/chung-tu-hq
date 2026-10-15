import { pass, skipped, warn, type Rule } from "../helpers.js";

/** Người nhập khẩu trên tờ khai lấy theo MST doanh nghiệp, không theo tên tiếng Anh trên invoice (PRODUCT §7.4). */
export const buyerMst: Rule = {
  code: "R-BUYER-MST",
  title: "Người mua trên invoice là doanh nghiệp (theo MST)",
  severity: "INFO",
  docKinds: ["INVOICE"],
  directions: ["NK"], // hàng xuất: người mua ở nước ngoài
  run(s, ctx) {
    const mst = s.parties.buyer.taxCode.value;
    if (!mst) return skipped("Invoice không ghi MST người mua");
    if (mst !== ctx.org.taxCode) return warn(`MST người mua trên invoice ${mst} khác MST doanh nghiệp ${ctx.org.taxCode}`, ["/parties/buyer/taxCode"]);
    return pass(`Tên người mua trên invoice là tên tiếng Anh; tờ khai dùng tên theo MST ${ctx.org.taxCode}: ${ctx.org.name}`, ["/parties/buyer/name"]);
  },
};
