import { z } from "zod";
import { nDate, nNum, nStr, PartySchema, UncertaintiesSchema } from "./common.js";

export const ContainerSchema = z.object({
  no: nStr("Số container (4 chữ + 7 số, vd CMAU1234452)"),
  sealNo: nStr("Số chì (Seal No.)"),
  size: nStr("Loại/cỡ: 20GP, 40HC, 40GP, 45HC…"),
});

export const BillOfLadingExtractionSchema = z.object({
  billNo: nStr("Số vận đơn (B/L No. / HBL No.) – giữ nguyên chuỗi"),
  masterBillNo: nStr("Số vận đơn chủ (MBL / Master B/L) nếu in"),
  date: nDate("Ngày phát hành (Date of issue / Shipped on board date)"),
  shipper: PartySchema,
  consignee: PartySchema,
  notifyParty: PartySchema,
  vessel: nStr("Tên tàu (Vessel / Ocean vessel)"),
  voyage: nStr("Số chuyến (Voyage No.)"),
  portOfLoading: nStr("Cảng xếp hàng (Port of Loading) nguyên văn"),
  portOfDischarge: nStr("Cảng dỡ hàng (Port of Discharge) nguyên văn"),
  placeOfDelivery: nStr("Nơi giao hàng cuối (Place of Delivery / Final Destination) nếu khác cảng dỡ"),
  containers: z.array(ContainerSchema),
  packages: nNum("Tổng số kiện"),
  packageUnit: nStr("Loại kiện"),
  grossWeightKg: nNum("Tổng trọng lượng cả bì (kg)"),
  freightTerm: z.enum(["PREPAID", "COLLECT"]).nullable().describe("Freight prepaid / collect"),
  uncertainties: UncertaintiesSchema,
});
export type BillOfLadingExtraction = z.infer<typeof BillOfLadingExtractionSchema>;
