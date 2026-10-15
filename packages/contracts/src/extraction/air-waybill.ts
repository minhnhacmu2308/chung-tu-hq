import { z } from "zod";
import { nDate, nNum, nStr, PartySchema, UncertaintiesSchema } from "./common.js";

export const AirWaybillExtractionSchema = z.object({
  awbNo: nStr("Số MAWB (dạng 3 số-8 số, vd 618-44021375) – giữ nguyên dấu gạch"),
  hawbNo: nStr("Số HAWB nếu có"),
  date: nDate("Ngày phát hành"),
  shipper: PartySchema,
  consignee: PartySchema,
  flight: nStr("Số hiệu chuyến bay"),
  airportOfDeparture: nStr("Sân bay đi nguyên văn"),
  airportOfDestination: nStr("Sân bay đến nguyên văn"),
  pieces: nNum("Số kiện (No. of pieces)"),
  grossWeightKg: nNum("Trọng lượng cả bì (kg)"),
  chargeableWeightKg: nNum("Trọng lượng tính cước (kg)"),
  flightDate: nDate("Ngày bay (Requested Flight/Date, vd O3141/21DEC → năm theo ngày phát hành)"),
  placeOfIssue: nStr("Nơi phát hành (Executed at)"),
  uncertainties: UncertaintiesSchema,
});
export type AirWaybillExtraction = z.infer<typeof AirWaybillExtractionSchema>;
