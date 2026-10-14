import { skipped, warn, type Rule } from "../helpers.js";

/** CV 6376/TCHQ-GSQL: hàng chung container phải khai phương thức vận chuyển "2" và ghi số tờ khai liên quan vào Phần ghi chú. */
export const sharedContainer: Rule = {
  code: "R-SHARED-CONTAINER",
  title: "Hàng đóng chung container (CV 6376/TCHQ-GSQL)",
  severity: "WARNING",
  docKinds: ["BILL_OF_LADING"],
  run(s) {
    const marks = s.transport.containers.length;
    const hint = s.transport.masterBillNo.value && s.transport.billNo.value && s.transport.masterBillNo.value !== s.transport.billNo.value;
    if (!hint) return skipped("Không có dấu hiệu đóng chung container (một vận đơn, không có vận đơn chủ khác)");
    return warn(`Có vận đơn chủ ${s.transport.masterBillNo.value} khác HBL – nếu đóng chung container với lô khác: khai phương thức vận chuyển "2" và ghi số tờ khai liên quan vào Phần ghi chú (${marks} container)`, ["/transport/masterBillNo"]);
  },
};
