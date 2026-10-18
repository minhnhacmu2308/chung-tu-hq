// Thông tin Hải quan trả về của hồ sơ (CustomsInfo + kết quả phân luồng/thông quan) → ô tab "Hải quan trả về" của form đầy đủ (tên trường VNACCS).
// Chỉ đọc. Ô chưa có trong CustomsInfo (ngày giờ thay đổi đăng ký, ân hạn thuế, giải phóng hàng…) để trống – khối hiện "Có sau khi …".
import type { CustomsInfo, CustomsResult } from "@kb/contracts";
import type { FormValues } from "./form-state";

type Kind = "IDA" | "EDA";
type Result = { declarationNo?: string | undefined; channel?: CustomsResult["channel"] | undefined; clearanceStatus?: CustomsResult["clearanceStatus"] | undefined };

const CHANNEL: Record<CustomsResult["channel"], string> = { GREEN: "1", YELLOW: "2", RED: "3" };
const pad2 = (n: number) => String(n).padStart(2, "0");

function put(out: FormValues, key: string, v: string | number | undefined) {
  if (v !== undefined && String(v).trim()) out[key] = String(v);
}

export function customsValues(kind: Kind, info: CustomsInfo | null, result: Result | null): FormValues {
  const out: FormValues = {};
  const ida = kind === "IDA";
  put(out, ida ? "TK_ICN" : "TK_ECN", info?.declarationNo ?? result?.declarationNo);
  if (result?.channel) out["TK_LUONG"] = CHANNEL[result.channel];
  if (result?.clearanceStatus) out["TK_THONGQUAN"] = result.clearanceStatus === "CLEARED" ? "1" : "0";
  if (!info) return out;
  put(out, ida ? "TK_A09" : "TK_K10", info.registeredDate);
  put(out, ida ? "TK_AD11" : "TK_RT1", info.registeredTime);
  put(out, ida ? "TK_A06" : "TK_K07", info.inspectionCode);
  put(out, ida ? "TK_A07" : "TK_K08", info.customsOfficeName);
  put(out, ida ? "TK_A00" : "TK_K01", info.representativeHs);
  put(out, ida ? "TK_B12" : "TK_K69", info.pages);
  put(out, ida ? "TK_B13" : "TK_K70", info.lines);
  if (ida) {
    info.taxes.slice(0, 6).forEach((t, i) => {
      put(out, `THUE_KF${i + 1}`, t.code);
      put(out, `THUE_KG${i + 1}`, t.name);
      put(out, `THUE_KH${i + 1}`, t.amountVnd);
    });
    put(out, "THUE_B02", info.totalTaxVnd);
    put(out, "THUE_B03", info.guaranteeVnd);
    info.exchangeRates.slice(0, 3).forEach((r, i) => {
      put(out, `THUE_KJ${i + 1}`, r.currency);
      put(out, `THUE_KK${i + 1}`, r.rate);
    });
    put(out, "TK_A86", info.totalCustomsValue?.amount);
    put(out, "TK_C21", info.permitDate);
    put(out, "TK_AD4", info.permitTime);
    put(out, "TK_C20", info.chiefName);
    put(out, "TK_C22", info.inspectionDoneDate);
  } else {
    if (info.totalTaxVnd) {
      out["TK_ETA"] = info.totalTaxVnd;
      out["TK_AD7"] = "VND";
    }
    info.exchangeRates.slice(0, 2).forEach((r, i) => {
      put(out, `TK_RC${i + 1}`, r.currency);
      put(out, `TK_RD${i + 1}`, r.rate);
    });
    put(out, "TK_K86", info.permitDate);
    put(out, "TK_AD5", info.permitTime);
    put(out, "TK_K87", info.chiefName);
    put(out, "TK_CCD", info.inspectionDoneDate);
  }
  put(out, "CTHQ_CCM", info.directiveKind);
  info.directives.slice(0, 10).forEach((d, i) => {
    put(out, `CTHQ_D${pad2(i + 1)}`, d.date);
    put(out, `CTHQ_T${pad2(i + 1)}`, d.title);
    put(out, `CTHQ_I${pad2(i + 1)}`, d.content);
  });
  return out;
}

/** Trị giá / thuế Hải quan tính cho từng dòng, theo thứ tự `lineNos` (dòng hàng của tờ khai). */
export function customsItemValues(kind: Kind, info: CustomsInfo | null, lineNos: number[]): FormValues[] {
  const [value, currency, rate, tax] = kind === "IDA" ? ["HAG_B36", "HAG_B50", "HAG_B43", "HAG_B47"] : ["HAG_R07", "HAG_ADB", "HAG_TRA", "HAG_TAX"];
  return lineNos.map((n) => {
    const it = info?.items.find((x) => x.lineNo === n);
    const out: FormValues = {};
    if (!it) return out;
    put(out, value!, it.customsValue);
    put(out, currency!, it.customsValueCurrency);
    put(out, rate!, it.taxRate);
    put(out, tax!, it.taxAmountVnd);
    return out;
  });
}
