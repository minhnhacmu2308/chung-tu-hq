import { z } from "zod";
import { nDate, nNum, nStr, PartySchema, UncertaintiesSchema } from "./common.js";

export const InvoiceItemSchema = z.object({
  lineNo: z.number().int().positive().describe("Số thứ tự dòng hàng"),
  description: nStr("Mô tả hàng hóa nguyên văn (Description of goods / Commodity)"),
  hsCodeOnInvoice: nStr("Mã HS in trên invoice nếu có (giữ nguyên dấu chấm); chỉ tham khảo"),
  quantity: nNum("Số lượng"),
  unit: nStr("Đơn vị tính nguyên văn (PCS, SET, KG, CTN…)"),
  unitPrice: nNum("Đơn giá"),
  amount: nNum("Thành tiền của dòng"),
  origin: nStr("Xuất xứ dòng hàng (mã nước ISO-2) nếu in"),
});

export const InvoiceExtractionSchema = z.object({
  invoiceNo: nStr("Số hóa đơn: Invoice No. / Inv. No / Invoice Number / PI No – KHÔNG phải số PO hay số hợp đồng"),
  invoiceDate: nDate("Ngày hóa đơn (Invoice Date / Date)"),
  seller: PartySchema.describe("Người bán: Seller / Shipper / Exporter / Beneficiary"),
  buyer: PartySchema.describe("Người mua: Buyer / Consignee / Sold to / Messrs"),
  incoterm: nStr("Điều kiện giao hàng (EXW, FCA, FOB, CFR, CIF, DAP…) từ Terms of Delivery / Price Terms"),
  currency: nStr("Mã tiền tệ ISO 4217 (USD, EUR, JPY, CNY, KRW…)"),
  totalAmount: nNum("Tổng trị giá hóa đơn (Total Amount / Grand Total) – chép số, không tự cộng"),
  paymentTerms: nStr("Điều khoản thanh toán nguyên văn (T/T 30 days, L/C at sight…)"),
  poNo: nStr("Số đơn đặt hàng (P/O No., Order No., Your Ref) nếu có"),
  items: z.array(InvoiceItemSchema).describe("Danh sách dòng hàng theo thứ tự in"),
  grossWeightKg: nNum("Tổng trọng lượng cả bì (Gross Weight) tính bằng kg nếu in trên invoice"),
  packages: nNum("Tổng số kiện (packages / cartons / pallets) nếu in"),
  uncertainties: UncertaintiesSchema,
});
export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
