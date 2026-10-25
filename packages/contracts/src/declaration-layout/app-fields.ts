// Tờ khai của hồ sơ (chỉ tiêu theo mã app: MA_LH, PTVC, CANG_DO…) ↔ ô tờ khai đầy đủ (tên trường VNACCS: TK_ICB, TK_MTC, VD_DST…) và ô nào người khai sửa được
// theo giai đoạn. Thuần – FE (form đầy đủ ở bước Review) và backend (API sửa chỉ tiêu) dùng chung một quy tắc.
// - Bảng chuyển mã tách ô giống lúc truyền FPT (packages/core integration/domain/declaration-to-fpt.ts); sửa ô con thì ghép lại đúng định dạng chỉ tiêu.
// - Ô người khai nhập chưa có mã app (mã phân loại hàng hóa, ủy thác, bảo lãnh, trung chuyển…) lưu trên tờ khai với mã = tên trường VNACCS ("ô bổ sung").
import type { CustomsStage } from "../customs-flow.js";
import { awaitingContent, recallExempt } from "../customs-summary.js";
import { branchRanges } from "../declaration/branches.js";
import { isDeclarationFieldEditable, type DeclarationSection, type DeclarationStatus } from "../dto/declaration.js";
import { NO_INSURANCE_VALUE, parseAdjustmentField } from "../dto/value-charges.js";
import type { FptFieldMeta } from "../fpt/common.js";
import { VN_EDA_CON_FIELDS, VN_EDA_FIELDS } from "../fpt/eda.js";
import { VN_IDA_FIELDS, VN_IDA_KTG_FIELDS, VN_IDA_VANDON_FIELDS } from "../fpt/ida.js";
import { amendLock, type AmendLock } from "./amend.js";
import { expandRepeat } from "./expand.js";
import { parseItemFieldCode } from "./item-fields.js";
import { layoutFor } from "./layout-for.js";
import type { LayoutField } from "./types.js";

type Kind = "IDA" | "EDA";
type Values = Record<string, string>;
/** `keys`: ô form của chỉ tiêu; `to`: giá trị chỉ tiêu → ô; `from`: ô → giá trị chỉ tiêu (không có → chỉ đọc). */
type Rule = { code: string; keys: string[]; to: (v: string) => Values; from?: (v: Values) => string };

const firstToken = (v: string) => v.split(/\s*[–-]\s*/)[0]!.trim();
const splitCodeName = (v: string) => {
  const m = /^([A-Z0-9-]{1,12})\s*[–-]\s*(.+)$/.exec(v);
  return m ? { code: m[1]!, name: m[2]!.trim() } : { code: v, name: v };
};
/**
 * Địa chỉ → tối đa `max` ô 35 ký tự (FE form + backend truyền FPT dùng chung).
 * Có xuống dòng ("\n") = người khai đã chia dòng trên form → giữ đúng dòng (dòng trống giữ chỗ, dòng thừa dồn vào ô cuối);
 * không có → cắt tự động ở khoảng trắng.
 */
export function splitAddressLines(addr: string, max: number): string[] {
  if (addr.includes("\n")) {
    const lines = addr.trim().split("\n").map((l) => l.trim());
    return lines.length <= max ? lines : [...lines.slice(0, max - 1), lines.slice(max - 1).filter(Boolean).join(" ")];
  }
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
const get = (v: Values, k: string) => (v[k] ?? "").trim();
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const direct = (code: string, key: string): Rule => ({ code, keys: [key], to: (v) => ({ [key]: v }), from: (v) => get(v, key) });
/** Ô mã (PTVC "1 – Đường hàng không" → "1"): sửa thì lưu phần mã (FPT chỉ gửi phần mã). */
const token = (code: string, key: string): Rule => ({ code, keys: [key], to: (v) => ({ [key]: firstToken(v) }), from: (v) => get(v, key) });
const codeName = (code: string, [c, n]: [string, string]): Rule => ({
  code, keys: [c, n],
  to: (v) => { const s = splitCodeName(v); return { [c]: s.code, [n]: s.name }; },
  from: (v) => (get(v, c) && get(v, n) && get(v, c) !== get(v, n) ? `${get(v, c)} – ${get(v, n)}` : get(v, c) || get(v, n)),
});
const qty = (code: string, [n, u]: [string, string]): Rule => ({
  code, keys: [n, u], to: (v) => ({ [n]: v.split(" ")[0] ?? "", [u]: v.split(" ")[1] ?? "" }), from: (v) => [get(v, n), get(v, u)].filter(Boolean).join(" "),
});
/** Trọng lượng: đơn vị luôn KGM khi truyền – chỉ sửa số. */
const weight = (code: string, [w, u]: [string, string]): Rule => ({ code, keys: [w], to: (v) => ({ [w]: v, [u]: "KGM" }), from: (v) => get(v, w) });
/** Ô địa chỉ → chỉ tiêu: cắt tự động ra đúng các dòng đang nhập thì lưu một chuỗi; khác (vd chỉ nhập dòng 3–4) thì lưu kèm xuống dòng. */
function joinAddressLines(lines: string[]): string {
  const used = lines.slice(0, lines.findLastIndex(Boolean) + 1);
  const flat = used.filter(Boolean).join(" ");
  const auto = splitAddressLines(flat, lines.length);
  return auto.length === used.length && auto.every((l, i) => l === used[i]) ? flat : used.join("\n");
}
const address = (code: string, keys: string[]): Rule => ({
  code, keys, to: (v) => Object.fromEntries(splitAddressLines(v, keys.length).map((c, i) => [keys[i]!, c])), from: (v) => joinAddressLines(keys.map((k) => get(v, k))),
});
const list = (code: string, key: (i: number) => string, max: number): Rule => ({
  code, keys: range(max).map(key),
  to: (v) => Object.fromEntries([...new Set(v.split(/[;,\s]+/).filter(Boolean))].slice(0, max).map((c, i) => [key(i + 1), c])),
  from: (v) => range(max).map((i) => get(v, key(i))).filter(Boolean).join(", "),
});
const permits: Rule = {
  code: "GP",
  keys: range(5).flatMap((i) => [`TK_SS${i}`, `TK_SN${i}`]),
  to: (v) => Object.fromEntries(v.split(";").map((x) => x.trim()).filter(Boolean).slice(0, 5).flatMap((x, i) => {
    const [c = "", ...rest] = x.split(/\s+/);
    return [[`TK_SS${i + 1}`, c.toUpperCase()], [`TK_SN${i + 1}`, rest.join("")]];
  })),
  from: (v) => range(5).map((i) => [get(v, `TK_SS${i}`), get(v, `TK_SN${i}`)].filter(Boolean).join(" ")).filter(Boolean).join("; "),
};

/** 1.47 / 1.48 "1150 USD" → mã phân loại A + mã tiền + số tiền; 1.48 không mua bảo hiểm → mã D. Chỉ đọc (sửa ở bước OCR – Chi phí và điều chỉnh trị giá). */
const charge = (code: string, [cls, cur, amt]: [string, string, string]): Rule => ({
  code, keys: [cls, cur, amt],
  to: (v) => {
    if (v === NO_INSURANCE_VALUE) return { [cls]: "D" };
    const m = /^(\d+(?:\.\d+)?) ([A-Z]{3})$/.exec(v.trim());
    return m ? { [cls]: "A", [cur]: m[2]!, [amt]: m[1]! } : {};
  },
});
/** 1.49 "A AD 100 USD; G SB 20 USD KPB" → KTG_VR/VI/VC/VP{n} + Phân bổ phí (APP_PB{n}). Chỉ đọc. */
const adjustments: Rule = {
  code: "KHOAN_DC",
  keys: range(5).flatMap((i) => [`KTG_VR${i}`, `KTG_VI${i}`, `KTG_VC${i}`, `KTG_VP${i}`, `APP_PB${i}`]),
  to: (v) => Object.fromEntries(parseAdjustmentField(v).slice(0, 5).flatMap((a, i) => [
    [`KTG_VR${i + 1}`, a.code], [`KTG_VI${i + 1}`, a.kind], [`KTG_VC${i + 1}`, a.currency], [`KTG_VP${i + 1}`, a.amount], [`APP_PB${i + 1}`, a.allocate === false ? "" : "1"],
  ])),
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
    charge("PHI_VC", ["KTG_FR1", "KTG_FR2", "KTG_FR3"]), charge("PHI_BH", ["KTG_IN1", "KTG_IN2", "KTG_IN3"]), adjustments,
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

/**
 * Ô người khai trên form nhưng tính từ chứng từ / mã khác – chỉ đọc cả khi nháp (cùng lý do DERIVED_DECLARATION_FIELD_CODES):
 * nhóm loại hình đi theo mã loại hình; đơn vị trọng lượng cố định KGM; cước, bảo hiểm, khoản điều chỉnh (1.46–1.49) là đầu vào trị giá tính thuế – sửa ở bước đọc chứng từ.
 */
const DERIVED_KEY = /^(APP_NHOM_LH|VD_GWT|TK_GWT|KTG_FR[123]|KTG_IN[123]|KTG_V[RICPT]\d+|APP_PB\d+)$/;

const SECTION_OF: Record<string, DeclarationSection> = { "cac-ben": "PARTIES", "van-chuyen": "TRANSPORT", "hoa-don-tri-gia": "VALUE" };

export type ExtraFieldMeta = { key: string; label: string; no?: string; section: DeclarationSection };

const declarantCache = new Map<Kind, Map<string, ExtraFieldMeta>>();
/** Mọi ô người khai nhập (tab Người khai, không phải dòng hàng) kèm nhãn, số chỉ tiêu, nhóm. */
function declarantFields(kind: Kind): Map<string, ExtraFieldMeta> {
  const hit = declarantCache.get(kind);
  if (hit) return hit;
  const out = new Map<string, ExtraFieldMeta>();
  const add = (f: LayoutField, section: DeclarationSection, label: string, no: string | undefined) => {
    if (f.origin === "CUSTOMS" || out.has(f.key)) return;
    const n = f.no ?? no;
    out.set(f.key, { key: f.key, label, section, ...(n ? { no: n } : {}) });
  };
  for (const s of layoutFor(kind).declarant) {
    const section = SECTION_OF[s.id] ?? "GENERAL";
    for (const b of s.blocks) for (const it of b.items) {
      if (it.kind === "field") add(it, section, it.label, undefined);
      else if (it.kind === "group") for (const f of it.fields) add(f, section, `${it.label} – ${f.label}`, it.no);
      else expandRepeat(it).forEach((row, i) => row.forEach((f) => add(f, section, `${it.label} ${i + 1} – ${f.label}`, it.no)));
    }
  }
  declarantCache.set(kind, out);
  return out;
}

const extraCache = new Map<Kind, Map<string, ExtraFieldMeta>>();
/** Ô bổ sung: ô người khai nhập không thuộc chỉ tiêu app nào và không tính từ chứng từ. */
function extraFields(kind: Kind): Map<string, ExtraFieldMeta> {
  const hit = extraCache.get(kind);
  if (hit) return hit;
  const covered = new Set(RULES[kind].flatMap((r) => r.keys));
  const out = new Map([...declarantFields(kind)].filter(([k]) => !covered.has(k) && !DERIVED_KEY.test(k)));
  extraCache.set(kind, out);
  return out;
}

/** Nhãn/số/nhóm của chỉ tiêu app theo ô đầu tiên trên form – dùng khi chỉ tiêu chưa có trên tờ khai mà người khai nhập lần đầu. */
export function appFieldMeta(kind: Kind, code: string): Omit<ExtraFieldMeta, "key"> | null {
  const key = RULES[kind].find((r) => r.code === code)?.keys[0];
  const meta = key ? declarantFields(kind).get(key) : undefined;
  if (!meta) return null;
  const { key: _k, ...rest } = meta;
  return rest;
}

/** Thông tin ô bổ sung (nhãn, số chỉ tiêu, nhóm) – null nếu `key` không phải ô bổ sung. */
export const extraFieldMeta = (kind: Kind, key: string): ExtraFieldMeta | null => extraFields(kind).get(key) ?? null;
export const isExtraFieldKey = (kind: Kind, key: string) => extraFields(kind).has(key);

/** Object FPT chứa ô bổ sung khi truyền (ô APP_* chỉ lưu trong app, không có trong đặc tả → null). */
export type FptObjectName = "objVN_IDA" | "objVN_IDA_VANDON" | "objVN_IDA_KTG" | "objVN_EDA" | "objVN_EDA_CON";
const FPT_OBJECTS: Record<Kind, [FptObjectName, FptFieldMeta[]][]> = {
  IDA: [["objVN_IDA", VN_IDA_FIELDS], ["objVN_IDA_VANDON", VN_IDA_VANDON_FIELDS], ["objVN_IDA_KTG", VN_IDA_KTG_FIELDS]],
  EDA: [["objVN_EDA", VN_EDA_FIELDS], ["objVN_EDA_CON", VN_EDA_CON_FIELDS]],
};
export function extraFieldFpt(kind: Kind, key: string): { object: FptObjectName; field: FptFieldMeta } | null {
  if (!isExtraFieldKey(kind, key)) return null;
  for (const [object, fields] of FPT_OBJECTS[kind]) {
    const field = fields.find((x) => x.name === key);
    if (field) return { object, field };
  }
  return null;
}

/** Giá trị ô bổ sung sai kiểu / vượt độ dài theo đặc tả FPT → thông báo; hợp lệ (hoặc rỗng) → null. Ngày nhập YYYY-MM-DD (khi truyền đổi sang dd/MM/yyyy). */
export function extraFieldIssue(kind: Kind, key: string, value: string): string | null {
  const spec = extraFieldFpt(kind, key)?.field;
  const v = value.trim();
  if (!spec || !v) return null;
  if (spec.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "Ngày phải theo dạng YYYY-MM-DD";
  if (spec.type === "long") return /^\d+$/.test(v) ? null : "Giá trị phải là số nguyên";
  if (spec.type === "decimal") return /^\d+(\.\d+)?$/.test(v) ? null : "Giá trị phải là số (dấu chấm cho phần thập phân, không có dấu phân cách nghìn)";
  return spec.type === "text" && spec.size && v.length > spec.size ? `Dài ${v.length} ký tự, vượt giới hạn ${spec.size} ký tự của ô ${key}` : null;
}

const blank = (v: string) => !v.trim() || v.trim() === "—";

/** Giá trị ô form từ các chỉ tiêu của tờ khai hồ sơ (chỉ tiêu app tách ô + ô bổ sung giữ nguyên). */
export function declarationFormValues(kind: Kind, fields: { code: string; value: string }[]): Values {
  const out: Values = {};
  for (const r of RULES[kind]) {
    const v = fields.find((x) => x.code === r.code)?.value ?? "";
    if (blank(v)) continue;
    // Hai chỉ tiêu cùng ô (EDA 2.31: NGAY_DI, dữ liệu cũ NGAY_DEN) → chỉ tiêu đứng trước trong bảng thắng.
    for (const [k, x] of Object.entries(r.to(v.trim()))) if (x && !(k in out)) out[k] = x;
  }
  for (const f of fields) if (isExtraFieldKey(kind, f.code) && !blank(f.value)) out[f.code] = f.value.trim();
  return out;
}

/** Ô form của một chỉ tiêu (mã app → các ô; ô bổ sung → chính nó; ô dòng hàng HANG.<id>.<ô> → ô đó). */
export function formKeysOf(kind: Kind, code: string): string[] {
  const item = parseItemFieldCode(code);
  if (item) return [item.key];
  const keys = RULES[kind].filter((r) => r.code === code).flatMap((r) => r.keys);
  return keys.length ? keys : isExtraFieldKey(kind, code) ? [code] : [];
}

/**
 * Chế độ sửa tờ khai theo giai đoạn:
 * - FULL: chưa khai báo (chưa khai tạm, hoặc khai tạm đã gọi về sửa – IDB) → sửa mọi ô người khai.
 * - AMEND: đã phân luồng, gọi về sửa đổi bổ sung (IDD) → khóa ô theo Phụ lục II (amendLock).
 * - LOCKED: chưa phải nháp, đã thông quan (sửa sau thông quan là nghiệp vụ AMA độc lập, không sửa trên tờ khai gốc), Hải quan từ chối/hủy.
 */
export type DeclarationEditMode = "FULL" | "AMEND" | "LOCKED";
export function declarationEditMode(status: DeclarationStatus, stage: CustomsStage): DeclarationEditMode {
  if (status !== "DRAFT") return "LOCKED";
  if (stage === "NOT_SENT" || stage === "RECALLED") return "FULL";
  if (stage === "AMEND_RECALLED") return "AMEND";
  return "LOCKED";
}

/** Tờ khai nhánh để tính phạm vi sửa: số tờ, giai đoạn Hải quan, số tờ khai (null = chưa được cấp). */
export type EditSheet = { no: number; stage: CustomsStage; declarationNo: string | null };
/**
 * Phạm vi sửa tờ khai theo tờ đã gọi về (spec tách tờ khai IDC/gọi về §2.4): `common` – mọi chỉ tiêu chung (header, vận đơn, trị giá/khoản điều chỉnh…);
 * `lines[n]` – ô dòng hàng của tờ n; `addRemoveLines` – thêm/xóa/đổi thứ tự dòng (làm dịch dòng giữa các tờ); `lockedSheets` – tờ còn hiệu lực ở Hải quan (lý do khóa);
 * `closedSheets` – tờ miễn gọi về (thông quan / sau thông quan / bị từ chối): dòng khóa hẳn, sửa bằng AMA.
 */
export type DeclarationEditScope = { common: DeclarationEditMode; lines: Record<number, DeclarationEditMode>; addRemoveLines: boolean; lockedSheets: number[]; closedSheets: number[] };

/** Tờ còn hiệu lực ở Hải quan: có số tờ khai, không miễn (thông quan / sau thông quan / từ chối), không đang chờ gửi nội dung. */
const activeAtCustoms = (s: EditSheet) => !!s.declarationNo && !recallExempt(s.stage) && !awaitingContent(s.stage);

/**
 * Lô một tờ: như `declarationEditMode` (không đổi hành vi). Lô nhiều tờ: tờ khai không nháp → khóa hết; còn tờ còn hiệu lực → khóa chỉ tiêu chung và thêm/xóa dòng;
 * không còn → chung AMEND nếu có tờ (sửa được) gọi về sửa đổi bổ sung, ngược lại FULL. Dòng: NOT_SENT / RECALLED → FULL, AMEND_RECALLED → AMEND, còn lại khóa.
 */
export function declarationEditScope(status: DeclarationStatus, sheets: EditSheet[]): DeclarationEditScope {
  if (sheets.length <= 1) {
    const mode = declarationEditMode(status, sheets[0]?.stage ?? "NOT_SENT");
    return { common: mode, lines: { 1: mode }, addRemoveLines: mode !== "LOCKED", lockedSheets: [], closedSheets: [] };
  }
  const sorted = [...sheets].sort((a, b) => a.no - b.no);
  if (status !== "DRAFT") return { common: "LOCKED", lines: Object.fromEntries(sorted.map((s) => [s.no, "LOCKED" as const])), addRemoveLines: false, lockedSheets: [], closedSheets: [] };
  const lines: Record<number, DeclarationEditMode> = Object.fromEntries(sorted.map((s) => [s.no, activeAtCustoms(s) ? "LOCKED" : declarationEditMode(status, s.stage)]));
  const lockedSheets = sorted.filter(activeAtCustoms).map((s) => s.no);
  const closedSheets = sorted.filter((s) => recallExempt(s.stage)).map((s) => s.no);
  if (lockedSheets.length) return { common: "LOCKED", lines, addRemoveLines: false, lockedSheets, closedSheets };
  const common: DeclarationEditMode = Object.values(lines).includes("AMEND") ? "AMEND" : "FULL";
  return { common, lines, addRemoveLines: true, lockedSheets, closedSheets };
}

/** Đích một lần sửa: chỉ tiêu chung / ô dòng hàng của dòng thuộc tờ `sheet` / thêm–xóa dòng / dựng lại tờ khai. */
export type EditTarget = { kind: "COMMON" } | { kind: "LINE"; sheet: number } | { kind: "ADD_REMOVE_LINES" } | { kind: "REBUILD" };
export type EditBlock = { reasonCode: "COMMON_LOCKED_SHEETS" | "LINE_SHEET_LOCKED" | "LINE_SHEET_CLOSED" | "DECLARATION_LOCKED"; params: Record<string, string | number> };

/**
 * Một quy tắc cho mọi đường sửa (backend + mock + FE): null = được sửa (AMEND vẫn kiểm Phụ lục II bằng `fieldEditBlock`).
 * Bị khóa vì tờ chưa gọi về → COMMON_LOCKED_SHEETS { sheets } / LINE_SHEET_LOCKED { sheet } (tờ đã thông quan / bị từ chối → LINE_SHEET_CLOSED { sheet }); khóa vì giai đoạn tờ khai (không nháp, lô một tờ đã khai) → DECLARATION_LOCKED.
 * Tờ không có trong phạm vi (dòng vượt số tờ đã lập) → theo chỉ tiêu chung.
 */
export function editBlockFor(scope: DeclarationEditScope, target: EditTarget): EditBlock | null {
  const sheets = scope.lockedSheets.join(", ");
  if (target.kind === "LINE") {
    if ((scope.lines[target.sheet] ?? scope.common) !== "LOCKED") return null;
    const partial = scope.lockedSheets.length > 0 || Object.values(scope.lines).some((m) => m !== "LOCKED");
    if (partial && scope.closedSheets.includes(target.sheet)) return { reasonCode: "LINE_SHEET_CLOSED", params: { sheet: target.sheet } };
    return partial ? { reasonCode: "LINE_SHEET_LOCKED", params: { sheet: target.sheet } } : { reasonCode: "DECLARATION_LOCKED", params: {} };
  }
  const open = target.kind === "COMMON" ? scope.common !== "LOCKED" : scope.common !== "LOCKED" && scope.addRemoveLines;
  if (open) return null;
  return scope.lockedSheets.length ? { reasonCode: "COMMON_LOCKED_SHEETS", params: { sheets } } : { reasonCode: "DECLARATION_LOCKED", params: {} };
}

/** Tờ (từ 1) chứa dòng `lineNo` trong danh sách dòng hiện tại (50 dòng/tờ theo thứ tự lineNo – branchRanges). Không có dòng → tờ 1. */
export function sheetOfLine(lineNos: number[], lineNo: number): number {
  const sorted = [...lineNos].sort((a, b) => a - b);
  const at = sorted.indexOf(lineNo);
  if (at < 0) return 1;
  return branchRanges(sorted).find((r) => at >= r.index[0] && at < r.index[1])?.no ?? 1;
}

/** Khóa ô tính từ chứng từ (không ghi lý do dưới ô – lời nhắc đầu form đã giải thích). */
export const DERIVED_LOCK: AmendLock = { basis: "SOFTWARE", reason: "" };

/**
 * Ô form sửa được → mã chỉ tiêu lưu: mọi ô người khai trừ ô tính từ chứng từ (chỉ tiêu chưa có trên tờ khai thì thêm khi lưu). AMEND: bỏ ô bị khóa theo Phụ lục II.
 * LOCKED: không ô nào. Chỉ tiêu theo tình huống không áp dụng: form làm mờ ô; dựng lại tờ khai tự bỏ giá trị.
 */
export function editableFormKeys(kind: Kind, mode: DeclarationEditMode, values: Values): Map<string, string> {
  const out = new Map<string, string>();
  if (mode === "LOCKED") return out;
  const open = (key: string) => mode === "FULL" || !amendLock(kind, key, values);
  for (const r of RULES[kind]) {
    if (!r.from || !isDeclarationFieldEditable(r.code)) continue;
    // Chỉ tiêu ghép nhiều ô: một ô bị khóa thì cả chỉ tiêu khóa (lưu theo chỉ tiêu).
    if (!r.keys.every(open)) continue;
    for (const key of r.keys) if (!out.has(key)) out.set(key, r.code);
  }
  for (const key of extraFields(kind).keys()) if (open(key)) out.set(key, key);
  return out;
}

/** Lý do một ô không sửa được ở chế độ `mode` (null = sửa được hoặc chỉ đọc vì chưa có trên tờ khai). */
export function formKeyLock(kind: Kind, key: string, mode: DeclarationEditMode, values: Values): AmendLock | null {
  if (mode === "AMEND") {
    const lock = amendLock(kind, key, values);
    if (lock) return lock;
    // Ô thuộc chỉ tiêu ghép có ô bị khóa (vd tên cảng đi cùng mã cảng).
    const rule = RULES[kind].find((r) => r.keys.includes(key));
    const sibling = rule?.keys.map((k) => amendLock(kind, k, values)).find(Boolean);
    if (sibling) return sibling;
  }
  return null;
}

/** Kiểm tra lần cuối trước khi lưu một chỉ tiêu (backend + mock): LOCKED → lỗi; AMEND → ô bị khóa theo Phụ lục II → lỗi kèm căn cứ. */
export function fieldEditBlock(kind: Kind, code: string, mode: DeclarationEditMode, fields: { code: string; value: string }[]): string | null {
  if (mode === "LOCKED") return "Tờ khai không ở giai đoạn được sửa (đã thông quan – sửa sau thông quan khai bằng nghiệp vụ AMA)";
  if (mode === "FULL") return null;
  const values = declarationFormValues(kind, fields);
  const lock = formKeysOf(kind, code).map((k) => amendLock(kind, k, values)).find(Boolean);
  return lock ? lock.reason : null;
}

/** Các chỉ tiêu cần lưu: chỉ tiêu có ô sửa được mà giá trị ghép lại khác bản gốc. */
export function pendingFormEdits(kind: Kind, original: Values, draft: Values, editable: Map<string, string>): { code: string; value: string }[] {
  const out: { code: string; value: string }[] = [];
  for (const code of new Set(editable.values())) {
    const r = RULES[kind].find((x) => x.code === code);
    const from = r?.from ?? (isExtraFieldKey(kind, code) ? (v: Values) => get(v, code) : undefined);
    if (!from) continue;
    const next = from(draft);
    if (next !== from(original)) out.push({ code, value: next });
  }
  return out;
}

/** Mã chỉ tiêu app có ô trên form đầy đủ. */
export const mappedAppCodes = (kind: Kind): string[] => [...new Set(RULES[kind].map((r) => r.code))];
