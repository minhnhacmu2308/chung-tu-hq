import { skipped, type Rule } from "../helpers.js";

/** CV 4613/TCHQ-VNACCS: mã địa điểm lưu kho đuôi "OZZ" chỉ dùng cho xuất; nhập khẩu lấy theo thông báo hàng đến. Kiểm thật ở GĐ 4 khi có chỉ tiêu 1.30. */
export const warehouseCode: Rule = {
  code: "R-WAREHOUSE-CODE",
  title: "Mã địa điểm lưu kho (CV 4613/TCHQ-VNACCS)",
  severity: "WARNING",
  docKinds: ["ARRIVAL_NOTICE"],
  run() {
    return skipped("Mã địa điểm lưu kho được kiểm khi dựng tờ khai (chỉ tiêu 1.30)");
  },
};
