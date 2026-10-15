import { skipped, warn, type Rule } from "../helpers.js";

/** CV 2061/TCHQ-GSQL: hàng chương 84/85 phải khai mã văn bản "MO" (mới) hoặc "CU" (đã qua sử dụng) ở ô đầu tiên. */
export const lawMoCu: Rule = {
  code: "R-LAW-MO-CU",
  title: "Hàng chương 84/85 khai MO/CU (CV 2061/TCHQ-GSQL)",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  directions: ["NK"], // CV 2061/TCHQ-GSQL chỉ áp dụng tờ khai nhập
  run(s) {
    const idx = s.items.map((i, k) => ({ i, k })).filter(({ i }) => /^(84|85)/.test((i.hsOnInvoice.value ?? "").replace(/\D/g, "")));
    if (!idx.length) return skipped("Không có dòng hàng chương 84/85 theo HS trên invoice");
    // GĐ 4 kiểm chỉ tiêu 1.37 thực tế; GĐ 2 chỉ nhắc để người khai chuẩn bị.
    return warn(`${idx.length} dòng chương 84/85: ô 1 chỉ tiêu 1.37 phải khai MO (máy móc chưa qua sử dụng) hoặc CU (đã qua sử dụng) – khai sai hệ thống từ chối đăng ký tờ khai (CV 2061/TCHQ-GSQL)`, idx.map(({ k }) => `/items/${k}/hsOnInvoice`));
  },
};
