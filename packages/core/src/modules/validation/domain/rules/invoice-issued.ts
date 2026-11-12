import { fail, pass, skipped, type Rule } from "../helpers.js";

/**
 * ADR 0013 mục 3 (cách A): hồ sơ xuất đặt Invoice "hệ thống phát hành" phải CẤP SỐ hóa đơn trước khi khai –
 * số đã cấp là chỉ tiêu Số hóa đơn trên tờ khai; hóa đơn phát hành/in sau khi thông quan. Chưa cấp số → chặn duyệt/truyền.
 */
export const invoiceIssued: Rule = {
  code: "R-INVOICE-ISSUED",
  title: "Đã cấp số hóa đơn thương mại",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  directions: ["XK"],
  run(s, ctx) {
    if (!ctx.dossier?.issuedKinds?.includes("INVOICE")) return skipped("Invoice không do hệ thống phát hành – đối chiếu theo invoice tải lên");
    const inv = s.issuedInvoice;
    return inv
      ? pass(`Đã cấp số hóa đơn ${inv.no} – số đã điền vào chỉ tiêu Số hóa đơn`, ["/invoice/no"])
      : fail("Chưa cấp số hóa đơn – bấm Cấp số hóa đơn ở bước OCR & kiểm tra để có số khai trên tờ khai (hóa đơn phát hành sau khi thông quan)", ["/invoice/no"]);
  },
};
