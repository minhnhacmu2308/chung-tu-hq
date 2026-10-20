// Quy tắc thuần của bản khai bổ sung AMA: ô nào sửa được, tự tính tiền thuế "Sau", điền sẵn từ tờ khai gốc, kiểm tra giá trị ô.
import type { CustomsInfo } from "../dto/customs.js";
import { VN_AMA_FIELDS, VN_AMA_HANG_FIELDS, VN_AMA_HANG_ROWS, VN_AMA_ROWS } from "../fpt/ama.js";
import type { FptFieldMeta } from "../fpt/common.js";
import { addDec, formatDec, parseDec, percentOf, subDec, ZERO, type Dec } from "./decimal.js";
import type { PostAmendmentLine, PostAmendmentStatus, PostAmendmentValues } from "./schema.js";

type Values = PostAmendmentValues;

/** 5 nhóm thuế và thu khác trên dòng hàng. */
export const OTHER_TAX_SLOTS = [1, 2, 3, 4, 5] as const;

/** Ô riêng của phần mềm (không gửi Hải quan). */
export const AMA_APP_HEADER_KEYS = ["APP_HD_GC"] as const;
export const AMA_APP_LINE_KEYS = ["APP_MA_HANG_TRUOC", "APP_MA_HANG_SAU"] as const;

/** Bản khai sửa được: đang lập hoặc AMB đã gọi về. Đã duyệt → sửa thì về lại nháp (như tờ khai). */
export const postAmendmentEditable = (status: PostAmendmentStatus) => status === "DRAFT" || status === "APPROVED" || status === "RECALLED";

/** Ô đầu bản khai lấy từ tờ khai gốc – không sửa (định danh tờ khai gốc, phần "trước khi khai bổ sung"). */
const HEADER_LOCKED = new Set(["TK_YNK", "TK_ICN", "TK_ICB", "TK_CHS", "TK_IDD", "TK_IPD", "TK_CDB", "TK_RTB", "TK_NTB", "TK_SYN"]);
export const HEADER_LOCK_REASON = "Theo tờ khai gốc";
export const LINE_LOCK_REASON = "Trước khi khai bổ sung – theo tờ khai gốc";

/** Ô "Trước" của dòng hàng (theo tờ khai gốc). */
const LINE_BEFORE = new Set([
  "HAG_RAN", "HAG_CMB", "HAG_ORB", "HAG_MKB", "HAG_MKQ", "HAG_MKC", "HAG_MKT", "HAG_MKR", "HAG_MKA",
  ...OTHER_TAX_SLOTS.flatMap((n) => [`HAG_MB${n}`, `HAG_MQ${n}`, `HAG_MC${n}`, `HAG_MK${n}`, `HAG_MR${n}`, `HAG_MA${n}`]),
]);

const HEADER_KEYS = new Set<string>([...VN_AMA_ROWS.map((r) => r[0]), ...AMA_APP_HEADER_KEYS]);
const LINE_KEYS = new Set<string>([...VN_AMA_HANG_ROWS.map((r) => r[0]), ...AMA_APP_LINE_KEYS]);

export const isAmaHeaderKey = (key: string) => HEADER_KEYS.has(key);
export const isAmaLineKey = (key: string) => LINE_KEYS.has(key);
export const amaHeaderLocked = (key: string) => HEADER_LOCKED.has(key);
export const amaLineLocked = (key: string) => LINE_BEFORE.has(key);

/** Ô tự tính trên dòng hàng "Sau": tiền thuế XNK, trị giá tính và tiền của thuế và thu khác. */
export const AMA_COMPUTED_KEYS = new Set(["HAG_AKA", ...OTHER_TAX_SLOTS.flatMap((n) => [`HAG_AB${n}`, `HAG_AA${n}`])]);

const SPEC = new Map<string, FptFieldMeta>([...VN_AMA_FIELDS, ...VN_AMA_HANG_FIELDS].map((f) => [f.name, f]));
export const amaFieldSpec = (key: string): FptFieldMeta | undefined => SPEC.get(key);

/** Lỗi định dạng của một ô theo đặc tả VNACCS_AMA (null = hợp lệ). Ô trống luôn hợp lệ ở bước nhập. */
export function amaFieldIssue(key: string, value: string): string | null {
  const v = value.trim();
  const f = SPEC.get(key);
  if (!v || !f) return null;
  if (f.type === "decimal" || f.type === "long") {
    if (!parseDec(v)) return "Phải là số";
    if (f.type === "long" && v.includes(".")) return "Phải là số nguyên";
    return null;
  }
  if (f.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "Ngày dạng YYYY-MM-DD";
  if (f.size && v.length > f.size) return `Tối đa ${f.size} ký tự`;
  return null;
}

/** Thuế suất dạng phần trăm ("5", "5%", "10 %") → số; thuế tuyệt đối ("2000 VND/KGM") → null (không tự tính). */
export function percentRate(rate: string | undefined): Dec | null {
  const t = (rate ?? "").trim().replace(/\s*%$/, "");
  return parseDec(t);
}

const isVat = (code: string | undefined) => (code ?? "").trim().toUpperCase().startsWith("V");
const dec = (v: string | undefined) => parseDec(v) ?? null;

/**
 * Tự tính lại tiền thuế "Sau" của một dòng (ô người khai đã sửa tay giữ nguyên):
 * - thuế XNK: HAG_AKA = HAG_AKB × HAG_AKR %;
 * - thuế và thu khác n: trị giá HAG_ABn của thuế GTGT (mã V…) = HAG_AKB + HAG_AKA + tiền các thu khác không phải GTGT;
 *   tiền HAG_AAn = HAG_ABn × HAG_ARn %. Thuế suất không phải % (thuế tuyệt đối) → không tự tính.
 */
export function recalcAmaLine(values: Values, manual: readonly string[]): Values {
  const out = { ...values };
  const own = new Set(manual);
  const set = (key: string, d: Dec, fixed: boolean) => {
    if (!own.has(key)) out[key] = formatDec(d, fixed ? { scale: 4, fixed: true } : { scale: 4 });
  };
  const value = dec(out["HAG_AKB"]);
  const rate = percentRate(out["HAG_AKR"]);
  if (value && rate) set("HAG_AKA", percentOf(value, rate), true);

  const amount = (n: number) => dec(out[`HAG_AA${n}`]);
  const used = OTHER_TAX_SLOTS.filter((n) => (out[`HAG_AK${n}`] ?? "").trim() || (out[`HAG_AR${n}`] ?? "").trim());
  // Thu khác không phải GTGT trước (TTĐB, BVMT… cộng vào trị giá tính GTGT), GTGT sau.
  for (const n of [...used.filter((k) => !isVat(out[`HAG_AK${k}`])), ...used.filter((k) => isVat(out[`HAG_AK${k}`]))]) {
    if (isVat(out[`HAG_AK${n}`]) && value) {
      const others = used.filter((k) => k !== n && !isVat(out[`HAG_AK${k}`])).reduce((s, k) => addDec(s, amount(k) ?? ZERO), ZERO);
      set(`HAG_AB${n}`, addDec(addDec(value, dec(out["HAG_AKA"]) ?? ZERO), others), false);
    }
    const base = dec(out[`HAG_AB${n}`]);
    const r = percentRate(out[`HAG_AR${n}`]);
    if (base && r) set(`HAG_AA${n}`, percentOf(base, r), true);
  }
  return out;
}

/** Tăng (+) / giảm (−) tiền thuế của dòng: thuế XNK và từng nhóm thu khác ("Sau" − "Trước"). */
export function amaLineDelta(values: Values): { importTax: string | null; other: { slot: number; amount: string }[] } {
  const diff = (after: string, before: string) => {
    const a = dec(values[after]);
    const b = dec(values[before]);
    return a || b ? formatDec(subDec(a ?? ZERO, b ?? ZERO), { scale: 4 }) : null;
  };
  const other = OTHER_TAX_SLOTS.flatMap((n) => {
    const d = diff(`HAG_AA${n}`, `HAG_MA${n}`);
    return d ? [{ slot: n, amount: d }] : [];
  });
  return { importTax: diff("HAG_AKA", "HAG_MKA"), other };
}

/** Sửa một ô dòng hàng: ô tự tính sửa tay → đánh dấu; để trống → bỏ đánh dấu; rồi tính lại. */
export function applyAmaLineEdit(line: PostAmendmentLine, key: string, value: string): PostAmendmentLine {
  const v = value.trim();
  const manual = new Set(line.manual);
  if (AMA_COMPUTED_KEYS.has(key)) {
    if (v) manual.add(key);
    else manual.delete(key);
  }
  const values = { ...line.values, [key]: v };
  return { ...line, values: recalcAmaLine(values, [...manual]), manual: [...manual] };
}

// ---------------------------------------------------------------- điền sẵn từ tờ khai gốc

/** Ô tờ khai gốc theo tên trường VNACCS (declarationFormValues) + thông tin Hải quan trả về. */
export type AmaSource = {
  direction: "NK" | "XK";
  form: Values;
  customs: CustomsInfo | null;
  declarationNo: string;
  /** Tỷ giá tính thuế của tờ khai gốc (nguyên tệ hóa đơn). */
  currency?: string | undefined;
  exchangeRate?: string | undefined;
};

/** Đầu bản khai: định danh tờ khai gốc, người khai, nộp thuế, bảo lãnh, tỷ giá & ghi chú "trước" (ghi chú "sau" = bằng "trước"). */
export function amaHeaderFrom(src: AmaSource): Values {
  const f = src.form;
  const ik = src.direction === "NK";
  const c = src.customs;
  const out: Values = {
    TK_YNK: ik ? "I" : "E",
    TK_ICN: src.declarationNo,
    TK_ICB: f["TK_ICB"] ?? "",
    TK_CHS: f["TK_CH"] ?? "",
    TK_CHB: c?.subsection ?? f["TK_CHB"] ?? "",
    TK_IDD: c?.registeredDate ?? "",
    TK_IPD: c?.permitDate ?? "",
    TK_RED: (ik ? f["TK_RED"] : f["TK_RID"]) ?? "",
    TK_IMC: (ik ? f["TK_IMC"] : f["TK_EPC"]) ?? "",
    TK_IMN: (ik ? f["TK_IMN"] : f["TK_EPN"]) ?? "",
    TK_IMY: (ik ? f["TK_IMY"] : f["TK_EPP"]) ?? "",
    TK_IMA: (ik ? f["TK_IMA"] : f["TK_EPA"]) ?? "",
    TK_IMT: (ik ? f["TK_IMT"] : f["TK_EPT"]) ?? "",
    TK_REF: f["TK_REF"] ?? "",
    TK_TTC: "VND",
    TK_ENC: f["TK_ENC"] ?? "",
    TK_NTB: f["TK_NT2"] ?? "",
    TK_NTA: f["TK_NT2"] ?? "",
  };
  for (const k of ["TK_BRC", "TK_BYA", "TK_BCM", "TK_BCN", "TK_SBC", "TK_RYA", "TK_SCM", "TK_SCN"]) out[k] = f[k] ?? "";
  const rate = c?.exchangeRates.find((r) => r.currency === src.currency) ?? c?.exchangeRates[0];
  const cur = rate?.currency ?? src.currency;
  const val = rate?.rate ?? src.exchangeRate;
  if (cur && val) {
    out["TK_CDB"] = cur;
    out["TK_RTB"] = val;
  }
  return out;
}

/** Dòng tờ khai gốc: ô VNACCS của dòng (HAG_CMN, HAG_OR, HAG_CMD, HAG_QN1/QT1, HAG_TXA, HAG_TX1…5/HAG_TT1…5) + số Hải quan tính. */
export type AmaSourceLine = {
  lineNo: number;
  values: Values;
  customs?: CustomsInfo["items"][number] | undefined;
  /** Thuế và thu khác đã biết (GTGT…): mã áp dụng, thuế suất %, trị giá tính, tiền thuế. */
  otherTaxes?: { code: string; rate: string; base?: string | undefined; amount?: string | undefined }[] | undefined;
};

/** "Trước" = tờ khai gốc; "Sau" mặc định bằng "Trước". */
export function amaLineFrom(src: AmaSourceLine): Values {
  const v = src.values;
  const c = src.customs;
  const qty = v["HAG_QN1"] ?? "";
  const unit = v["HAG_QT1"] ?? "";
  const before: Values = {
    HAG_RAN: String(src.lineNo).padStart(2, "0"),
    HAG_CMB: v["HAG_CMN"] ?? "",
    HAG_ORB: v["HAG_OR"] ?? "",
    HAG_MKB: c?.customsValue ?? "",
    HAG_MKQ: qty,
    HAG_MKC: unit,
    HAG_MKT: (c?.hsCode ?? v["HAG_CMD"] ?? "").replace(/\./g, ""),
    HAG_MKR: c?.taxRate ?? v["HAG_TXA"] ?? "",
    HAG_MKA: c?.taxAmountVnd ?? "",
  };
  (src.otherTaxes ?? []).slice(0, 5).forEach((t, i) => {
    const n = i + 1;
    before[`HAG_MK${n}`] = t.code;
    before[`HAG_MR${n}`] = t.rate;
    if (t.base) before[`HAG_MB${n}`] = t.base;
    if (t.amount) before[`HAG_MA${n}`] = t.amount;
  });
  const after: Values = {
    HAG_CMA: before["HAG_CMB"] ?? "", HAG_ORA: before["HAG_ORB"] ?? "",
    HAG_AKB: before["HAG_MKB"] ?? "", HAG_AKQ: qty, HAG_AKC: unit, HAG_AKT: before["HAG_MKT"] ?? "", HAG_AKR: before["HAG_MKR"] ?? "", HAG_AKA: before["HAG_MKA"] ?? "",
  };
  for (const n of OTHER_TAX_SLOTS) {
    const pairs: [string, string][] = [["MB", "AB"], ["MQ", "AQ"], ["MC", "AC"], ["MK", "AK"], ["MR", "AR"], ["MA", "AA"]];
    for (const [b, a] of pairs) if (before[`HAG_${b}${n}`]) after[`HAG_${a}${n}`] = before[`HAG_${b}${n}`] ?? "";
  }
  return { ...before, ...after };
}

/** Mẫu chèn hợp đồng gia công vào ghi chú: "SO HOP DONG: <số> ngày <dd/mm/yyyy>". */
export function processingContractNote(no: string, isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `SO HOP DONG: ${no}${y && m && d ? ` ngày ${d}/${m}/${y}` : ""}`;
}
