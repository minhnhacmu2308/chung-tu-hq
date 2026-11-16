// Body IDA/EDA gửi FPT đúng hình mẫu request FPT (người dùng cung cấp 2026-11-15; Postman API-VNACCS NEW 21/04/2026 /api/IDA, IDA01, EDA01):
// đủ mọi key của từng object, ô trống vẫn gửi ("" cho chữ/ngày/Long, null cho decimal) – không bỏ key.
// Gửi thiếu key → S0049 "Số tờ khai đã nhập chưa được đăng ký" (2026-11-15). Chỉ gửi key có trong mẫu:
// IDA không có TK_CHB, HAG_B25, HAG_MAHANG; EDA không có TK_ID, HAG_R01, HAG_MAHANG.
// AMA (Postman /api/AMA): 79 key đầu + 120 key mỗi dòng; ô trống ghi đúng như mẫu (null hay "").
import { fptKey, type FptFieldMeta } from "./common.js";
import { VN_EDA_CON_FIELDS, VN_EDA_FIELDS, VN_EDA_HANG_FIELDS } from "./eda.js";
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

const EDA_KEYS = [
  "tK_ECN", "tK_FIC", "tK_BNO", "tK_DNO", "tK_TDN", "tK_ECB", "tK_CCC", "tK_CH", "tK_MTC", "tK_ECD", "tK_CHB", "tK_RID", "tK_EPC", "tK_EPN", "tK_EPP", "tK_EPA", "tK_EPT",
  "tK_EXC", "tK_EXN", "tK_CGC", "tK_ECC", "tK_CGN", "tK_CGP", "tK_CGA", "tK_CAT", "tK_CAC", "tK_CAS", "tK_CGK", "tK_EKN", "tK_NO", "tK_NOT", "tK_GW", "tK_GWT",
  "tK_ST", "tK_DSC", "tK_DSN", "tK_PSC", "tK_PSN", "tK_VSC", "tK_VSN", "tK_SYM", "tK_MRK", "tK_SS1", "tK_SN1", "tK_SS2", "tK_SN2", "tK_SS3", "tK_SN3", "tK_SS4", "tK_SN4",
  "tK_SS5", "tK_SN5", "tK_IV1", "tK_IV3", "tK_IV2", "tK_IVD", "tK_BRC", "tK_IVP", "tK_BYA", "tK_IP2", "tK_BCM", "tK_IP3", "tK_BCN", "tK_IP4", "tK_IP1", "tK_SBC", "tK_FCD",
  "tK_RYA", "tK_FKK", "tK_SCM", "tK_SCN", "tK_TP", "tK_CNV", "tK_TPM", "tK_ENC", "tK_EA1", "tK_EB1", "tK_EA2", "tK_EB2", "tK_EA3", "tK_EB3", "tK_NT2", "tK_REF", "tK_DPD",
  "tK_ST1", "tK_AD1", "tK_SD1", "tK_ST2", "tK_AD2", "tK_SD2", "tK_ST3", "tK_AD3", "tK_SD3", "tK_ARP", "tK_ADT",
];
const EDA_HANG_KEYS = [
  "haG_CMD", "haG_COC", "haG_CMN", "haG_QN1", "haG_QT1", "haG_QN2", "haG_QT2", "haG_BPR", "haG_UPR", "haG_UPC", "haG_TSC", "haG_BPC", "haG_REG", "haG_TDL",
  "haG_TXR", "haG_OL1", "haG_OL2", "haG_OL3", "haG_OL4", "haG_OL5", "haG_RE", "haG_TXD", "haG_DPR", "haG_TXN", "haG_TXC", "haG_TXA", "haG_TXB",
];
const CON_KEYS = ["coN_VC1", "coN_VC2", "coN_VC3", "coN_VC4", "coN_VC5", "coN_VN", "coN_VA", ...Array.from({ length: 50 }, (_, i) => `coN_C${String(i + 1).padStart(2, "0")}`)];
/** Mẫu EDA (khai lần đầu) gửi kèm chỉ thị Hải quan rỗng; EDA01 gửi nguyên văn chỉ thị Hải quan trả về (không qua đây). */
const EMPTY_EDA_CTHQ = Object.fromEntries(Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0")).flatMap((n) => [[`cthQ_D${n}`, ""], [`cthQ_T${n}`, ""], [`cthQ_I${n}`, ""]]));

const edaHead = shaper(EDA_KEYS, VN_EDA_FIELDS);
const edaHang = shaper(EDA_HANG_KEYS, VN_EDA_HANG_FIELDS);
const edaCon = shaper(CON_KEYS, VN_EDA_CON_FIELDS);

/** Đưa body EDA (đã qua EdaRequestSchema) về đúng hình mẫu FPT; objVN_EDA_CTHQ đã có (EDA01) giữ nguyên. Thuần. */
export function shapeEdaBody(body: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(body["objVN_EDA_HANG"]) ? (body["objVN_EDA_HANG"] as Record<string, unknown>[]) : [];
  return {
    ...body,
    objVN_EDA: edaHead(body["objVN_EDA"] as Record<string, unknown>),
    objVN_EDA_CON: edaCon(body["objVN_EDA_CON"] as Record<string, unknown> | null),
    objVN_EDA_CTHQ: body["objVN_EDA_CTHQ"] ?? { ...EMPTY_EDA_CTHQ },
    objVN_EDA_HANG: items.map(edaHang),
  };
}

// AMA – key và cách ghi ô trống lấy nguyên từ mẫu Postman /api/AMA (đặc tả trong code mới có 32/77 trường).
const AMA_KEYS: readonly string[] = ["tK_ADD", "tK_AD2", "tK_AD3", "tK_SYN", "tK_A02", "tK_AD1", "tK_CHS", "tK_CHB", "tK_YNK", "tK_ICN", "tK_ICB", "tK_IDD", "tK_ADE", "tK_CTO", "tK_IPD", "tK_TTC", "tK_RED", "tK_BRC", "tK_IMC", "tK_IMN", "tK_BYA", "tK_BCM", "tK_IMY", "tK_BCN", "tK_IMA", "tK_IMT", "tK_SBC", "tK_A12", "tK_RYA", "tK_A13", "tK_SCM", "tK_A14", "tK_REC", "tK_SCN", "tK_A16", "tK_ENC", "tK_ADS", "tK_ADT", "tK_ADU", "tK_REF", "tK_CDB", "tK_RTB", "tK_NTB", "tK_CDA", "tK_RTA", "tK_NTA", "tK_ADB", "tK_A23", "tK_ADN", "tK_KA1", "tK_KB1", "tK_KU1", "tK_KC1", "tK_KW1", "tK_KA2", "tK_KB2", "tK_KU2", "tK_KC2", "tK_KW2", "tK_KA3", "tK_KB3", "tK_KU3", "tK_KC3", "tK_KW3", "tK_KA4", "tK_KB4", "tK_KU4", "tK_KC4", "tK_KW4", "tK_KA5", "tK_KB5", "tK_KU5", "tK_KC5", "tK_KW5", "tK_A24", "tK_A25", "tK_ADO", "tK_ADF", "tK_ADP"];
const AMA_NULL = new Set(["tK_ADD", "tK_AD2", "tK_SYN", "tK_ICN", "tK_BYA", "tK_RYA", "tK_ADT", "tK_ADU", "tK_RTB", "tK_RTA", "tK_A23", "tK_KC1", "tK_KC2", "tK_KC3", "tK_KC4", "tK_KC5", "tK_A24", "tK_A25"]);
const AMA_HANG_KEYS: readonly string[] = ["haG_RAN", "haG_MK1", "haG_MK2", "haG_A26", "haG_A28", "haG_CMB", "haG_ORB", "haG_CMA", "haG_ORA", "haG_MK3", "haG_MKB", "haG_MKQ", "haG_MKC", "haG_MKT", "haG_MKR", "haG_MKA", "haG_A45", "haG_AKB", "haG_AKQ", "haG_AKC", "haG_AKT", "haG_AKR", "haG_AKA", "haG_MK4", "haG_A52", "haG_ADC", "haG_A53", "haG_KD1", "haG_KE1", "haG_MB1", "haG_MQ1", "haG_MC1", "haG_KI1", "haG_MR1", "haG_MA1", "haG_MK5", "haG_KL1", "haG_AB1", "haG_AQ1", "haG_AC1", "haG_AK1", "haG_AR1", "haG_AA1", "haG_KS1", "haG_KV1", "haG_KT1", "haG_KD2", "haG_KE2", "haG_MB2", "haG_MQ2", "haG_MC2", "haG_KI2", "haG_MR2", "haG_MA2", "haG_KL2", "haG_AB2", "haG_AQ2", "haG_AC2", "haG_AK2", "haG_AR2", "haG_AA2", "haG_KS2", "haG_KV2", "haG_KT2", "haG_KD3", "haG_KE3", "haG_MB3", "haG_MQ3", "haG_MC3", "haG_KI3", "haG_MR3", "haG_MA3", "haG_KL3", "haG_AB3", "haG_AQ3", "haG_AC3", "haG_AK3", "haG_AR3", "haG_AA3", "haG_KS3", "haG_KV3", "haG_KT3", "haG_KD4", "haG_KE4", "haG_MB4", "haG_MQ4", "haG_MC4", "haG_KI4", "haG_MR4", "haG_MA4", "haG_KL4", "haG_AB4", "haG_AQ4", "haG_AC4", "haG_AK4", "haG_AR4", "haG_AA4", "haG_KS4", "haG_KV4", "haG_KT4", "haG_KD5", "haG_KE5", "haG_MB5", "haG_MQ5", "haG_MC5", "haG_KI5", "haG_MR5", "haG_MA5", "haG_KL5", "haG_AB5", "haG_AQ5", "haG_AC5", "haG_AK5", "haG_AR5", "haG_AA5", "haG_KS5", "haG_KV5", "haG_KT5", "haG_MMA", "haG_AMA"];
const AMA_HANG_NULL = new Set(["haG_MKB", "haG_MKQ", "haG_AKB", "haG_AKQ", "haG_A53", "haG_MB1", "haG_MQ1", "haG_AB1", "haG_AQ1", "haG_KT1", "haG_MB2", "haG_MQ2", "haG_AB2", "haG_AQ2", "haG_KT2", "haG_MB3", "haG_MQ3", "haG_AB3", "haG_AQ3", "haG_KT3", "haG_MB4", "haG_MQ4", "haG_AB4", "haG_AQ4", "haG_KT4", "haG_MB5", "haG_MQ5", "haG_AB5", "haG_AQ5", "haG_KT5"]);

const amaShaper = (keys: readonly string[], nulls: ReadonlySet<string>) => (o: Record<string, unknown> | null | undefined): Record<string, unknown> =>
  Object.fromEntries(keys.map((k) => {
    const v = o?.[k];
    return [k, v === undefined || v === null || v === "" ? (nulls.has(k) ? null : "") : v];
  }));
const amaHead = amaShaper(AMA_KEYS, AMA_NULL);
const amaHang = amaShaper(AMA_HANG_KEYS, AMA_HANG_NULL);

/** Đưa body AMA (đã qua AmaRequestSchema) về đúng hình mẫu FPT: đủ 79 / 120 key, ô trống null hoặc "" như mẫu. Thuần. */
export function shapeAmaBody(body: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(body["objVN_AMA_HANG"]) ? (body["objVN_AMA_HANG"] as Record<string, unknown>[]) : [];
  return { ...body, objVN_AMA: amaHead(body["objVN_AMA"] as Record<string, unknown>), objVN_AMA_HANG: items.map(amaHang) };
}
