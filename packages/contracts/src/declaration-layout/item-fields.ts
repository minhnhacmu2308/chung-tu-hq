// Ô dòng hàng của tờ khai đầy đủ (HAG_*): ô nào sửa ở đâu, giá trị phần mềm tự điền khi truyền FPT, ô người khai sửa đè. Thuần – FE, backend, mock dùng chung.
// - DOC: số liệu chứng từ (mô tả, lượng, ĐVT, đơn giá, trị giá, xuất xứ) – sửa ở bước OCR để luật đối chiếu chéo và thuế tính lại.
// - HS: mã HS và thuế suất đi theo mã – xác nhận qua luồng HS.
// - DERIVED: phần mềm điền từ dữ liệu khác, không sửa (mã tiền của đơn giá = nguyên tệ hóa đơn).
// - INPUT: chỉ có trên tờ khai – người khai nhập / sửa đè giá trị tự điền. Lưu trên tờ khai với mã "HANG.<id dòng>.<tên trường>" (theo id, không theo số dòng).
import type { FptFieldMeta } from "../fpt/common.js";
import { VN_EDA_HANG_FIELDS } from "../fpt/eda.js";
import { VN_IDA_HANG_FIELDS } from "../fpt/ida.js";
import { itemFields } from "./expand.js";
import { layoutFor } from "./layout-for.js";

type Kind = "IDA" | "EDA";
type Values = Record<string, string>;

export type ItemFieldClass = "DOC" | "HS" | "DERIVED" | "INPUT";
const DOC: Record<Kind, Set<string>> = {
  IDA: new Set(["HAG_CMN", "HAG_QN1", "HAG_QT1", "HAG_BPR", "HAG_UPR", "HAG_OR"]),
  EDA: new Set(["HAG_CMN", "HAG_QN1", "HAG_QT1", "HAG_BPR", "HAG_UPR", "APP_XUAT_XU"]),
};
// Tờ khai xuất: app không tính thuế xuất khẩu (Hải quan tính sau EDA) → thuế suất 2.67 người khai nhập khi hệ thống không tự xác định.
const HS: Record<Kind, Set<string>> = { IDA: new Set(["HAG_CMD", "HAG_TXA"]), EDA: new Set(["HAG_CMD"]) };
const DERIVED = new Set(["HAG_UPC"]);

export function itemFieldClass(kind: Kind, key: string): ItemFieldClass {
  if (DOC[kind].has(key)) return "DOC";
  if (HS[kind].has(key)) return "HS";
  if (DERIVED.has(key)) return "DERIVED";
  return "INPUT";
}

const metaCache = new Map<Kind, Map<string, { label: string; no?: string }>>();
/** Ô người khai của dòng hàng (bố cục form) – nhãn, số chỉ tiêu. */
function itemDeclarantFields(kind: Kind) {
  const hit = metaCache.get(kind);
  if (hit) return hit;
  const out = new Map<string, { label: string; no?: string }>();
  for (const b of layoutFor(kind).item.declarant) for (const it of b.items) for (const f of itemFields(it)) {
    if (f.origin === "CUSTOMS" || out.has(f.key)) continue;
    const no = f.no ?? (it.kind === "field" ? undefined : it.no);
    out.set(f.key, { label: it.kind === "field" ? f.label : `${it.label} – ${f.label}`, ...(no ? { no } : {}) });
  }
  metaCache.set(kind, out);
  return out;
}

/** Ô người khai của dòng hàng (mọi nhóm). */
export const isItemFieldKey = (kind: Kind, key: string) => itemDeclarantFields(kind).has(key);

/** Ô dòng hàng người khai nhập được trên tờ khai (INPUT). */
export const itemInputKeys = (kind: Kind): string[] => [...itemDeclarantFields(kind).keys()].filter((k) => itemFieldClass(kind, k) === "INPUT");

const PREFIX = "HANG.";
/** Mã chỉ tiêu lưu ô dòng hàng trên tờ khai. */
export const itemFieldCode = (itemId: string, key: string) => `${PREFIX}${itemId}.${key}`;
export function parseItemFieldCode(code: string): { itemId: string; key: string } | null {
  if (!code.startsWith(PREFIX)) return null;
  const rest = code.slice(PREFIX.length);
  const dot = rest.lastIndexOf(".");
  return dot > 0 ? { itemId: rest.slice(0, dot), key: rest.slice(dot + 1) } : null;
}
/** Mã chỉ tiêu dòng hàng hợp lệ: ô INPUT của bố cục. Trả nhãn/số để thêm vào tờ khai khi nhập lần đầu. */
export function itemFieldMeta(kind: Kind, code: string): { itemId: string; key: string; label: string; no?: string } | null {
  const p = parseItemFieldCode(code);
  const meta = p ? itemDeclarantFields(kind).get(p.key) : undefined;
  if (!p || !meta || itemFieldClass(kind, p.key) !== "INPUT") return null;
  return { ...p, ...meta };
}

/** Ô người khai đã nhập / sửa đè cho một dòng (theo id dòng). */
export function itemOverrides(fields: { code: string; value: string }[], itemId: string): Values {
  const out: Values = {};
  for (const f of fields) {
    const p = parseItemFieldCode(f.code);
    if (p && p.itemId === itemId && f.value.trim()) out[p.key] = f.value.trim();
  }
  return out;
}

const SPEC: Record<Kind, Map<string, FptFieldMeta>> = {
  IDA: new Map(VN_IDA_HANG_FIELDS.map((f) => [f.name, f])),
  EDA: new Map(VN_EDA_HANG_FIELDS.map((f) => [f.name, f])),
};
/** Đặc tả FPT của ô dòng hàng (ô APP_* chỉ lưu trong app → undefined). */
export const itemFieldFpt = (kind: Kind, key: string): FptFieldMeta | undefined => SPEC[kind].get(key);

/** Giá trị ô dòng hàng sai kiểu / vượt độ dài theo đặc tả FPT → thông báo; hợp lệ (hoặc rỗng) → null. */
export function itemFieldIssue(kind: Kind, key: string, value: string): string | null {
  const spec = itemFieldFpt(kind, key);
  const v = value.trim();
  if (!spec || !v) return null;
  if (spec.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "Ngày phải theo dạng YYYY-MM-DD";
  if (spec.type === "long") return /^\d+$/.test(v) ? null : "Giá trị phải là số nguyên";
  if (spec.type === "decimal") return /^\d+(\.\d+)?$/.test(v) ? null : "Giá trị phải là số (dấu chấm cho phần thập phân, không có dấu phân cách nghìn)";
  return spec.type === "text" && spec.size && v.length > spec.size ? `Dài ${v.length} ký tự, vượt giới hạn ${spec.size} ký tự của ô ${key}` : null;
}

/* ---------- Giá trị phần mềm tự điền khi truyền (người khai sửa đè được) ---------- */

const num = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : 0);
/** Mã áp dụng thuế suất GTGT (VB9xx) theo thuế suất – CHƯA đối chiếu bảng "Thue khac - GTGT.xls" (D3). */
export const vatCode = (rate: string | null | undefined) => ({ "10": "VB901", "8": "VB903", "5": "VB905", "0": "VB900" })[String(num(rate ?? "10"))] ?? "VB901";
/**
 * Mã Biểu thuế NK (chỉ tiêu 1.80) suy từ ghi chú chính sách (dòng hàng chưa lưu mã riêng). Danh sách Phụ lục II TT39:
 * B04 ATIGA, B05 ACFTA, B06 AKFTA, B09 AJCEP, B10 VJEPA (B17 là Chương 98). FTA khác chưa có mã trong văn bản đã đối chiếu → code null (chặn truyền nếu người khai không nhập).
 */
const FTA_TAX_TABLES: [string, string | null][] = [["ATIGA", "B04"], ["ACFTA", "B05"], ["AKFTA", "B06"], ["AJCEP", "B09"], ["VJEPA", "B10"], ["EVFTA", null], ["VKFTA", null], ["CPTPP", null], ["RCEP", null]];
export const taxTable = (note: string | null | undefined): { code: string | null; fta?: string } => {
  const hit = FTA_TAX_TABLES.find(([name]) => note?.includes(name));
  return hit ? { code: hit[1], fta: hit[0] } : { code: "B01" };
};

/**
 * 2.80 (mã văn bản pháp luật khác, theo dòng hàng): phần không có "số dòng:" áp cho mọi dòng; "2: GP KD" chỉ cho dòng 2.
 * Các phần cách nhau ";", mã cách nhau dấu cách/phẩy; mỗi dòng bỏ mã trùng.
 */
export function lawCodesByLine(value: string, lineNos: number[]): Map<number, string[]> {
  const all: string[] = [];
  const own = new Map<number, string[]>();
  for (const part of value.split(";").map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*:\s*(.*)$/.exec(part);
    const codes = (m ? m[2]! : part).split(/[\s,]+/).filter(Boolean).map((c) => c.toUpperCase());
    if (m) own.set(Number(m[1]), [...(own.get(Number(m[1])) ?? []), ...codes]);
    else all.push(...codes);
  }
  return new Map(lineNos.map((n) => [n, [...new Set([...all, ...(own.get(n) ?? [])])]]));
}

export type ItemDefaultsInput = { lineNo: number; quantity: string; unit: string; vatRate?: string | null | undefined; policyNote?: string | null | undefined };
/**
 * Ô dòng hàng phần mềm tự điền khi truyền: số lượng (2) = số lượng (1) (chưa có bảng quy đổi ĐVT biểu thuế – D3), mã tiền đơn giá = nguyên tệ,
 * đơn vị đơn giá = ĐVT; IDA: mã biểu thuế từ ghi chú FTA, mã GTGT từ thuế suất; EDA: mã văn bản pháp luật theo dòng từ chỉ tiêu VBPQ.
 */
export function itemDefaults(kind: Kind, it: ItemDefaultsInput, ctx: { currency: string; vbpq?: string; lineNos?: number[] }): Values {
  const unit = it.unit || "PCE";
  const out: Values = { HAG_QN2: it.quantity, HAG_QT2: unit, HAG_UPC: ctx.currency, HAG_TSC: unit };
  if (kind === "IDA") {
    const t = taxTable(it.policyNote);
    if (t.code) out["HAG_ORS"] = t.code;
    out["HAG_TX5"] = vatCode(it.vatRate);
  } else {
    const codes = lawCodesByLine(ctx.vbpq ?? "", ctx.lineNos ?? [it.lineNo]).get(it.lineNo) ?? [];
    codes.slice(0, 5).forEach((c, k) => (out[`HAG_OL${k + 1}`] = c));
  }
  return out;
}
