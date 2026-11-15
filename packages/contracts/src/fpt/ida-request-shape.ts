// Body IDA gửi FPT đúng hình mẫu request FPT (người dùng cung cấp 2026-11-15): đủ mọi key của từng object, ô trống vẫn gửi
// ("" cho chữ/ngày/Long, null cho decimal) – không bỏ key. Gửi thiếu key → S0049 "Số tờ khai đã nhập chưa được đăng ký" (2026-11-15).
// Chỉ gửi key có trong mẫu: TK_CHB, HAG_B25 không có trong mẫu → không gửi.
import { fptKey, type FptFieldMeta } from "./common.js";
import { VN_IDA_FIELDS, VN_IDA_HANG_FIELDS, VN_IDA_KTG_FIELDS, VN_IDA_VANDON_FIELDS } from "./ida.js";

const IDA_KEYS = [
  "tK_ICB", "tK_CCC", "tK_MTC", "tK_SKB", "tK_ICN", "tK_FIC", "tK_BNO", "tK_DNO", "tK_TDN", "tK_RED", "tK_IMC", "tK_IMN", "tK_IMY", "tK_IMA", "tK_IMT",
  "tK_NMC", "tK_NMN", "tK_EPC", "tK_EPN", "tK_EPY", "tK_EPA", "tK_EP2", "tK_EP3", "tK_EP4", "tK_EPO", "tK_ENM", "tK_OL1", "tK_OL2", "tK_OL3", "tK_OL4", "tK_OL5",
  "tK_IV1", "tK_IV2", "tK_IV3", "tK_IVD", "tK_IVP", "tK_IP1", "tK_IP2", "tK_IP3", "tK_IP4", "tK_TP", "tK_N4",
  "tK_SS1", "tK_SN1", "tK_SS2", "tK_SN2", "tK_SS3", "tK_SN3", "tK_SS4", "tK_SN4", "tK_SS5", "tK_SN5", "tK_ENC", "tK_TPM", "tK_BP",
  "tK_EA1", "tK_EB1", "tK_EA2", "tK_EB2", "tK_EA3", "tK_EB3", "tK_NT2", "tK_REF", "tK_DPD", "tK_ST1", "tK_AD1", "tK_SD1", "tK_ST2", "tK_AD2", "tK_SD2",
  "tK_ST3", "tK_AD3", "tK_SD3", "tK_ARP", "tK_ADT", "tK_RYA", "tK_SBC", "tK_BCN", "tK_SCN", "tK_SCM", "tK_ICC", "tK_ICD", "tK_CH", "tK_BCM", "tK_BYA", "tK_BRC",
];
const VANDON_KEYS = [
  "vD_BL1", "vD_BL2", "vD_BL3", "vD_BL4", "vD_BL5", "vD_NO", "vD_NOT", "vD_GW", "vD_GWT", "vD_COC", "vD_ST", "vD_DST", "vD_DSN", "vD_PSC", "vD_PSN",
  "vD_VSC", "vD_VSN", "vD_ARR", "vD_MRK", "vD_ISD",
];
const KTG_KEYS = [
  "ktG_VD1", "ktG_VD2", "ktG_VCC", "ktG_VPC", "ktG_FR1", "ktG_FR2", "ktG_FR3", "ktG_IN1", "ktG_IN2", "ktG_IN3", "ktG_IN4",
  ...[1, 2, 3, 4, 5].flatMap((n) => [`ktG_VR${n}`, `ktG_VI${n}`, `ktG_VC${n}`, `ktG_VP${n}`, `ktG_VT${n}`]), "ktG_VLD",
];
const HANG_KEYS = [
  "haG_CMD", "haG_GZC", "haG_CMN", "haG_QN1", "haG_QT1", "haG_VN1", "haG_VN2", "haG_VN3", "haG_VN4", "haG_VN5", "haG_QN2", "haG_QT2", "haG_BPR", "haG_UPR",
  "haG_UPC", "haG_TSC", "haG_SPD", "haG_OR", "haG_ORS", "haG_KWS", "haG_TDL", "haG_TXN", "haG_TXR", "haG_RE",
  ...[1, 2, 3, 4, 5].flatMap((n) => [`haG_TX${n}`, `haG_TR${n}`, `haG_TG${n}`]), "haG_REG", "haG_TXC", "haG_TXB", "haG_TXA", "haG_DPR", "haG_BPC", "haG_TXD",
];

const shaper = (keys: readonly string[], fields: readonly FptFieldMeta[]) => {
  const decimal = new Set(fields.filter((f) => f.type === "decimal").map((f) => fptKey(f.name)));
  return (o: Record<string, unknown> | null | undefined): Record<string, unknown> =>
    Object.fromEntries(keys.map((k) => {
      const v = o?.[k];
      return [k, v === undefined || v === null || v === "" ? (decimal.has(k) ? null : "") : v];
    }));
};
const head = shaper(IDA_KEYS, VN_IDA_FIELDS);
const vandon = shaper(VANDON_KEYS, VN_IDA_VANDON_FIELDS);
const ktg = shaper(KTG_KEYS, VN_IDA_KTG_FIELDS);
const hang = shaper(HANG_KEYS, VN_IDA_HANG_FIELDS);

/** Đưa body IDA (đã qua IdaRequestSchema) về đúng hình mẫu FPT; các object khác (vd objVN_IDA_CTHQ của IDA01) giữ nguyên. Thuần. */
export function shapeIdaBody(body: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(body["objVN_IDA_HANG"]) ? (body["objVN_IDA_HANG"] as Record<string, unknown>[]) : [];
  return {
    ...body,
    objVN_IDA: head(body["objVN_IDA"] as Record<string, unknown>),
    objVN_IDA_HANG: items.map(hang),
    objVN_IDA_VANDON: vandon(body["objVN_IDA_VANDON"] as Record<string, unknown>),
    objVN_IDA_KTG: ktg(body["objVN_IDA_KTG"] as Record<string, unknown>),
  };
}
