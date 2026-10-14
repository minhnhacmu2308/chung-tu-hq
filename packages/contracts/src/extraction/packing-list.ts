import { z } from "zod";
import { nDate, nNum, nStr, UncertaintiesSchema } from "./common.js";

export const PackingListItemSchema = z.object({
  lineNo: z.number().int().positive(),
  description: nStr("Mô tả hàng"),
  quantity: nNum("Số lượng"),
  unit: nStr("Đơn vị tính"),
  packages: nNum("Số kiện của dòng"),
  netWeightKg: nNum("Trọng lượng tịnh (kg)"),
  grossWeightKg: nNum("Trọng lượng cả bì (kg)"),
});

export const PackingListExtractionSchema = z.object({
  invoiceNo: nStr("Số invoice tham chiếu trên packing list"),
  date: nDate("Ngày lập"),
  packages: nNum("Tổng số kiện (Total packages / cartons / pallets)"),
  packageUnit: nStr("Loại kiện: CARTON, PALLET, PACKAGE, CASE, BAG…"),
  grossWeightKg: nNum("Tổng trọng lượng cả bì – quy về kg (nếu ghi lbs thì quy đổi và ghi vào uncertainties)"),
  netWeightKg: nNum("Tổng trọng lượng tịnh (kg)"),
  volumeCbm: nNum("Tổng thể tích (CBM / m3)"),
  marks: nStr("Ký mã hiệu (Marks & Nos)"),
  items: z.array(PackingListItemSchema),
  uncertainties: UncertaintiesSchema,
});
export type PackingListExtraction = z.infer<typeof PackingListExtractionSchema>;
