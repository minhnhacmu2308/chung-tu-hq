// Tờ khai của hồ sơ (chỉ tiêu theo mã app: MA_LH, PTVC, CANG_DO…) ↔ form tờ khai đầy đủ (ô theo tên trường VNACCS: TK_ICB, TK_MTC, VD_DST…).
// Cách tách ô giống lúc truyền FPT (packages/core integration/domain/declaration-to-fpt.ts) để màn hình hiện đúng những gì sẽ gửi.
// Bản đầu chỉ sửa được ô một–một đã có trên tờ khai (qua API sửa chỉ tiêu, có ghi field_audit); ô ghép / ô chưa lưu chỉ đọc.
import { isDeclarationFieldEditable, type DeclarationField, type LineItem } from "@kb/contracts";
import type { FormValues } from "./form-state";

type Kind = "IDA" | "EDA";
type Rule = { code: string; to: (v: string) => FormValues; editable: boolean };

const firstToken = (v: string) => v.split(/\s*[–-]\s*/)[0]!.trim();
const splitCodeName = (v: string) => {
  const m = /^([A-Z0-9-]{1,12})\s*[–-]\s*(.+)$/.exec(v);
  return m ? { code: m[1]!, name: m[2]!.trim() } : { code: v, name: v };
};
/** Địa chỉ dài → tối đa 4 ô 35 ký tự, cắt ở khoảng trắng. */
function splitAddress(addr: string, max: number): string[] {
  const out: string[] = [];
  let rest = addr.trim();
  while (rest && out.length < max) {
    if (rest.length <= 35) {
      out.push(rest);
      rest = "";
    } else {
      const cut = rest.lastIndexOf(" ", 35);
      const at = cut > 10 ? cut : 35;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
  }
  return out;
}

const direct = (code: string, key: string): Rule => ({ code, to: (v) => ({ [key]: v }), editable: true });
const token = (code: string, key: string): Rule => ({ code, to: (v) => ({ [key]: firstToken(v) }), editable: true });
const codeName = (code: string, [c, n]: [string, string]): Rule => ({ code, to: (v) => { const s = splitCodeName(v); return { [c]: s.code, [n]: s.name }; }, editable: false });
const qty = (code: string, [n, u]: [string, string]): Rule => ({ code, to: (v) => ({ [n]: v.split(" ")[0] ?? "", [u]: v.split(" ")[1] ?? "" }), editable: false });
const weight = (code: string, [w, u]: [string, string]): Rule => ({ code, to: (v) => ({ [w]: v, [u]: "KGM" }), editable: false });
const address = (code: string, keys: string[]): Rule => ({ code, to: (v) => Object.fromEntries(splitAddress(v, keys.length).map((c, i) => [keys[i]!, c])), editable: false });
const list = (code: string, key: (i: number) => string, max: number): Rule => ({
  code, to: (v) => Object.fromEntries([...new Set(v.split(/[;,\s]+/).filter(Boolean))].slice(0, max).map((c, i) => [key(i + 1), c])), editable: false,
});
const permits: Rule = {
  code: "GP",
  to: (v) => Object.fromEntries(v.split(";").map((x) => x.trim()).filter(Boolean).slice(0, 5).flatMap((x, i) => {
    const [c = "", ...rest] = x.split(/\s+/);
    return [[`TK_SS${i + 1}`, c.toUpperCase()], [`TK_SN${i + 1}`, rest.join("")]];
  })),
  editable: false,
};

const COMMON_INVOICE = (): Rule[] => [
  token("HD_PL", "TK_IV1"), direct("SO_HD", "TK_IV3"), direct("NGAY_HD", "TK_IVD"), token("PT_TT", "TK_IVP"),
  token("GIA_PL", "TK_IP1"), direct("DK_GIA", "TK_IP2"), direct("MA_TT", "TK_IP3"), direct("TONG_TG", "TK_IP4"),
  token("NGUOI_NT", "TK_TPM"), permits, direct("GHI_CHU", "TK_NT2"), direct("SO_QLNB", "TK_REF"),
];

const RULES: Record<Kind, Rule[]> = {
  IDA: [
    direct("MA_LH", "TK_ICB"), direct("TNTX_TK", "TK_TDN"), direct("HAN_TX", "TK_RED"), token("CQHQ", "TK_CH"), token("PTVC", "TK_MTC"), token("PL_CN", "TK_SKB"), direct("NGAY_DK", "TK_ICD"),
    direct("NNK_MST", "TK_IMC"), direct("NNK_TEN", "TK_IMN"), direct("NNK_DC", "TK_IMA"), direct("NNK_DT", "TK_IMT"),
    direct("NXK_TEN", "TK_EPN"), address("NXK_DC", ["TK_EPA", "TK_EP2", "TK_EP3", "TK_EP4"]), direct("MA_NUOC", "TK_EPO"), list("VBPQ", (i) => `TK_OL${i}`, 5),
    direct("SO_VD", "VD_BL1"), qty("SO_KIEN", ["VD_NO", "VD_NOT"]), weight("TRONG_LUONG", ["VD_GW", "VD_GWT"]), token("KHO", "VD_ST"),
    codeName("CANG_DO", ["VD_DST", "VD_DSN"]), codeName("CANG_XEP", ["VD_PSC", "VD_PSN"]), direct("HO_HIEU", "VD_VSC"), direct("PTVC_TEN", "VD_VSN"), direct("NGAY_DEN", "VD_ARR"), direct("SL_CONT", "VD_COC"),
    token("KHAI_TG", "KTG_VD1"), direct("CT_TG", "KTG_VLD"),
    ...COMMON_INVOICE(),
  ],
  EDA: [
    direct("MA_LH", "TK_ECB"), direct("TNTX_TK", "TK_TDN"), direct("HAN_TN", "TK_RID"), token("CQHQ", "TK_CH"), token("PTVC", "TK_MTC"), direct("NGAY_DK", "TK_ECD"),
    direct("NXK_MST", "TK_EPC"), direct("NXK_TEN", "TK_EPN"), direct("NXK_DC", "TK_EPA"), direct("NXK_DT", "TK_EPT"),
    direct("NNK_TEN", "TK_CGN"), address("NNK_DC", ["TK_CGA", "TK_CAT", "TK_CAC", "TK_CAS"]), direct("MA_NUOC", "TK_CGK"),
    direct("SO_VD", "TK_EKN"), qty("SO_KIEN", ["TK_NO", "TK_NOT"]), weight("TRONG_LUONG", ["TK_GW", "TK_GWT"]), token("KHO", "TK_ST"),
    codeName("CANG_DO", ["TK_DSC", "TK_DSN"]), codeName("CANG_XEP", ["TK_PSC", "TK_PSN"]), direct("HO_HIEU", "TK_VSC"), direct("PTVC_TEN", "TK_VSN"),
    // 2.31 ngày hàng đi: backend ghi NGAY_DI, dữ liệu mẫu cũ ghi NGAY_DEN.
    direct("NGAY_DI", "TK_SYM"), direct("NGAY_DEN", "TK_SYM"), qty("TG_TT", ["TK_FKK", "TK_FCD"]),
    list("SO_CONT", (i) => `CON_C${String(i).padStart(2, "0")}`, 50),
    ...COMMON_INVOICE(),
  ],
};

const blank = (v: string) => !v.trim() || v.trim() === "—";

/** Giá trị ô form từ các chỉ tiêu của tờ khai hồ sơ. */
export function declarationValues(kind: Kind, fields: Pick<DeclarationField, "code" | "value">[]): FormValues {
  const out: FormValues = {};
  for (const r of RULES[kind]) {
    const v = fields.find((x) => x.code === r.code)?.value ?? "";
    if (blank(v)) continue;
    for (const [k, x] of Object.entries(r.to(v.trim()))) if (x) out[k] = x;
  }
  return out;
}

/** Dòng hàng → ô HAG_* (chỉ đọc ở bản đầu – sửa HS / dòng hàng ở bước OCR, AI Agent). */
export function itemValues(kind: Kind, items: Pick<LineItem, "description" | "quantity" | "unit" | "unitPrice" | "amount" | "origin" | "hsSuggested" | "hsConfirmed" | "importDutyRate">[]): FormValues[] {
  return items.map((it) => {
    const v: FormValues = {
      HAG_CMD: it.hsConfirmed ?? it.hsSuggested ?? "", HAG_CMN: it.description, HAG_QN1: it.quantity, HAG_QT1: it.unit,
      HAG_UPR: it.unitPrice, HAG_BPR: it.amount,
    };
    // Mẫu 02 không có ô xuất xứ riêng (ghi trong mô tả "#&mã nước"), ô thuế suất là thuế xuất khẩu – chỉ điền cho tờ khai nhập.
    if (kind === "IDA") {
      v["HAG_OR"] = it.origin;
      if (it.importDutyRate !== undefined) v["HAG_TXA"] = it.importDutyRate;
    }
    return v;
  });
}

/** Ô form sửa được → mã chỉ tiêu: ô một–một, chỉ tiêu đã có trên tờ khai và được sửa (isDeclarationFieldEditable). `canEdit` = nháp + có quyền. */
export function editableKeys(kind: Kind, fields: Pick<DeclarationField, "code">[], canEdit: boolean): Map<string, string> {
  const out = new Map<string, string>();
  if (!canEdit) return out;
  for (const r of RULES[kind]) {
    if (!r.editable || !isDeclarationFieldEditable(r.code) || !fields.some((x) => x.code === r.code)) continue;
    const [key] = Object.keys(r.to("x"));
    if (key && !out.has(key)) out.set(key, r.code);
  }
  return out;
}

/** Các chỉ tiêu cần lưu: ô sửa được có giá trị khác bản gốc. */
export function pendingEdits(original: FormValues, draft: FormValues, editable: Map<string, string>): { code: string; value: string }[] {
  const out: { code: string; value: string }[] = [];
  for (const [key, code] of editable) {
    const next = (draft[key] ?? "").trim();
    if (next !== (original[key] ?? "").trim()) out.push({ code, value: next });
  }
  return out;
}

/** Mã chỉ tiêu app có ô trên form đầy đủ. */
export const mappedCodes = (kind: Kind): string[] => [...new Set(RULES[kind].map((r) => r.code))];
