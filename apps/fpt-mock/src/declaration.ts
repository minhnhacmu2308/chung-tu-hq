// Dựng phản hồi EDA/IDA giống FPT: lấy khung key từ response thật, chép dữ liệu gửi lên ("" → null), rồi điền các trường VNACCS tự tính.
import { Decimal } from "decimal.js";
import { CUSTOMS_OFFICE_NAMES, EXCHANGE_RATES, WAREHOUSE_NAMES } from "./catalog.js";
import { DEPARTURE_IN_PAST, mockError, type FptError } from "./envelope.js";
import edaSample from "./fixtures/eda-response-success.json" with { type: "json" };
import { parseFptDate, vnDate, vnDateTime } from "./vn-time.js";

export type Kind = "EDA" | "IDA";
type Rec = Record<string, unknown>;
export type DeclarationRequest = { account: Rec; head: Rec; con: Rec | null; cthq: Rec | null; items: Rec[]; extra: Rec };

/** Key giữ giá trị cố định trong mọi object FPT trả về. */
const FIXED: Rec = { isView: false, dataManagement: 1, dataStatus: 1, stopChangeEvent: false };
const blank = (o: Rec): Rec => Object.fromEntries(Object.keys(o).map((k) => [k, k in FIXED ? FIXED[k] : null]));
const sampleItem = edaSample.objEDA[0]!;
const EDA_TEMPLATE = {
  head: blank(sampleItem.objVN_EDA), con: blank(sampleItem.objVN_EDA_CON), status: blank(sampleItem.objVN_EDA_TRANGTHAI),
  cthq: blank(sampleItem.objVN_EDA_CTHQ), item: blank(sampleItem.objVN_EDA_HANG[0]!),
};

const norm = (v: unknown) => (v === "" || v === undefined ? null : v);
/** Template EDA: chỉ giữ key có trong response thật. IDA (chưa có mẫu): giữ mọi key gửi lên. */
const fill = (template: Rec | null, input: Rec | null): Rec => {
  const src = input ?? {};
  if (!template) return { ...FIXED, ...Object.fromEntries(Object.entries(src).map(([k, v]) => [k, norm(v)])) };
  return Object.fromEntries(Object.keys(template).map((k) => [k, k in src ? norm(src[k]) : template[k]]));
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const dec = (v: unknown) => { try { return str(v) ? new Decimal(str(v)) : null; } catch { return null; } };

// ---------------------------------------------------------------- kiểm tra

const REQUIRED: Record<Kind, { head: [key: string, index: string, name: string][]; item: [string, string, string][] }> = {
  EDA: {
    head: [
      ["tK_ECB", "ECB", "Export Declaration Type"], ["tK_CH", "CH", "Customs Office"], ["tK_MTC", "MTC", "Means of Transportation Code"], ["tK_CHB", "CHB", "Customs Sub-section"],
      ["tK_EPC", "EPC", "Exporter Code"], ["tK_EPN", "EPN", "Exporter Name"], ["tK_EPT", "EPT", "Exporter Phone"], ["tK_CGN", "CGN", "Consignee Name"], ["tK_CGA", "CGA", "Consignee Address"],
      ["tK_NO", "NO", "Number of Packages"], ["tK_NOT", "NOT", "Package Unit"], ["tK_GW", "GW", "Gross Weight"], ["tK_GWT", "GWT", "Gross Weight Unit"], ["tK_DSC", "DSC", "Final Destination"], ["tK_PSC", "PSC", "Port of Loading"],
    ],
    item: [["haG_CMD", "CMD", "HS Code"], ["haG_CMN", "CMN", "Description of Goods"], ["haG_QN1", "QN1", "Quantity (1)"], ["haG_QT1", "QT1", "Quantity Unit (1)"]],
  },
  IDA: {
    head: [["tK_ICB", "ICB", "Import Declaration Type"], ["tK_CH", "CH", "Customs Office"], ["tK_MTC", "MTC", "Means of Transportation Code"], ["tK_IMC", "IMC", "Importer Code"], ["tK_IMN", "IMN", "Importer Name"]],
    item: [["haG_CMD", "CMD", "HS Code"], ["haG_CMN", "CMN", "Description of Goods"], ["haG_QN1", "QN1", "Quantity (1)"], ["haG_QT1", "QT1", "Quantity Unit (1)"]],
  },
};
const DATE_FIELDS: [key: string, index: string, name: string][] = [["tK_SYM", "SYM", "Departure Planned Date"], ["tK_IVD", "IVD", "Invoice Date"], ["tK_ECD", "ECD", "Declaration Planned Date"], ["tK_DPD", "DPD", "Departure Date"], ["tK_ADT", "ADT", "Arrival Date"]];

/** Luật VNACCS mock. Mã thật đã thấy: S1139. Còn lại MOCK-* (chỉ để thấy lỗi chạy qua được luồng). */
export function validateDeclaration(kind: Kind, req: DeclarationRequest, now: Date): FptError[] {
  const errors: FptError[] = [];
  for (const [key, index, name] of REQUIRED[kind].head) if (!str(req.head[key])) errors.push(mockError("MOCK-REQ", index, name, `Chưa nhập ${name} (${key}).`));
  if (!req.items.length) errors.push(mockError("MOCK-REQ", "CMD", "Goods", "Tờ khai phải có ít nhất một dòng hàng."));
  req.items.forEach((it, i) => {
    for (const [key, index, name] of REQUIRED[kind].item) if (!str(it[key])) errors.push(mockError("MOCK-REQ", index, name, `Dòng hàng ${i + 1}: chưa nhập ${name} (${key}).`, i + 1));
  });
  for (const [key, index, name] of DATE_FIELDS) if (str(req.head[key]) && parseFptDate(str(req.head[key])) === null) errors.push(mockError("MOCK-FMT", index, name, `${key} phải dạng dd/MM/yyyy, nhận "${str(req.head[key])}".`));
  if (kind === "EDA") {
    // S1139 (mẫu thật): ngày hàng đi dự kiến < ngày khai báo (TK_ECD; bỏ trống = hôm nay giờ VN).
    const sym = parseFptDate(str(req.head["tK_SYM"]));
    const declared = parseFptDate(str(req.head["tK_ECD"])) ?? parseFptDate(vnDate(now));
    if (sym !== null && declared !== null && sym < declared) errors.push(DEPARTURE_IN_PAST);
  }
  return errors;
}

// ---------------------------------------------------------------- dựng phản hồi

const MSG: Record<Kind, { code: string; name: string }> = {
  EDA: { code: "VAE0LA0", name: "Khai Báo Tờ Khai Xuất Khẩu" }, // (mẫu thật)
  IDA: { code: "VAD0LA0", name: "Khai Báo Tờ Khai Nhập Khẩu" }, // giả định theo quy ước mã VNACCS
};
export const msgResult = (fn: string, code: string, name: string, decNumber: string, now: Date) => ({ function: fn, code, name, decNumber, time: vnDateTime(now), type: "C", ediBase64: null });

export function buildDeclarationResult(kind: Kind, req: DeclarationRequest, declarationNo: string, now: Date): Rec {
  const isEda = kind === "EDA";
  const head = fill(isEda ? EDA_TEMPLATE.head : null, req.head);
  const currency = str(req.head["tK_IP3"]) || "USD";
  const rate = new Decimal(EXCHANGE_RATES[currency] ?? "1");
  const invoiceTotal = dec(req.head["tK_IP4"]) ?? new Decimal(0);
  const sumBpr = req.items.reduce((s, it) => s.plus(dec(it["haG_BPR"]) ?? 0), new Decimal(0));
  const firstHs = str(req.items[0]?.["haG_CMD"]);

  Object.assign(head, {
    [isEda ? "tK_ECN" : "tK_ICN"]: Number(declarationNo),
    tK_CH: null, // FPT trả null dù gửi lên có mã (mẫu thật)
    tK_K01: firstHs.slice(0, 4) || null, // 4 số HS dòng đầu
    tK_K08: CUSTOMS_OFFICE_NAMES[str(req.head["tK_CH"])] ?? (str(req.head["tK_CH"]) ? `CCHQ ${str(req.head["tK_CH"])}` : null),
    tK_RC1: currency, tK_RD1: rate.toNumber(), tK_TP: sumBpr.toNumber(), tK_PAY: "A",
  });
  if (isEda) {
    const psc = str(req.head["tK_PSC"]);
    Object.assign(head, {
      tK_PSC: psc.length === 3 ? `VN${psc}` : norm(psc), // cảng xếp hàng: FPT thêm tiền tố VN (mẫu thật)
      tK_K42: WAREHOUSE_NAMES[str(req.head["tK_ST"])] ?? (str(req.head["tK_ST"]) ? `KHO ${str(req.head["tK_ST"])}` : null),
      tK_FKK: dec(req.head["tK_FKK"])?.toNumber() ?? null, tK_K69: "3", tK_K70: "1",
    });
  }

  const items = req.items.map((it, i) => {
    const row = fill(isEda ? EDA_TEMPLATE.item : null, it);
    const bpr = dec(it["haG_BPR"]) ?? new Decimal(0);
    const qty = dec(it["haG_QN1"]);
    // Trị giá tính thuế VND: phân bổ tổng hóa đơn theo tỷ lệ trị giá dòng × tỷ giá.
    const vnd = (sumBpr.isZero() ? new Decimal(0) : bpr.div(sumBpr)).mul(invoiceTotal).mul(rate).toDecimalPlaces(4);
    return Object.assign(row, {
      haG_R01: String(i + 1).padStart(2, "0"), haG_R07: vnd.toNumber(), haG_BPC: "VND",
      haG_CVU: qty && !qty.isZero() ? vnd.div(qty).toDecimalPlaces(6).toNumber() : null, haG_ADA: "VND", haG_QCV: norm(it["haG_QT1"]),
      haG_TAX: 0, haG_ADB: "VND", haG_TDT: "1", haG_MANUAL: "0", haG_FOC: "0",
    });
  });

  const status = { ...(isEda ? EDA_TEMPLATE.status : { ...FIXED, tK_ID: null }), tK_LUONG: "0", tK_TRANGTHAI: "A", tK_THONGQUAN: "0" };
  const p = `objVN_${kind}`;
  return {
    objMsgResult: msgResult(kind, MSG[kind].code, MSG[kind].name, declarationNo, now),
    [p]: head,
    ...(isEda ? { [`${p}_CON`]: fill(EDA_TEMPLATE.con, req.con) } : {}),
    ...(isEda ? {} : Object.fromEntries(Object.entries(req.extra).map(([k, v]) => [k, v && typeof v === "object" && !Array.isArray(v) ? fill(null, v as Rec) : v]))),
    [`${p}_TRANGTHAI`]: status,
    [`${p}_CTHQ`]: fill(isEda ? EDA_TEMPLATE.cthq : null, req.cthq),
    [`${p}_HANG`]: items,
  };
}
