// Sửa nhanh tại ô trên bản in (kiểu ô Excel): ô nào nhập thẳng được, đọc chữ người dùng gõ / dán thành giá trị lưu, gom các ô chưa lưu thành
// danh sách chỉ tiêu cần lưu. Hàm thuần – print-declaration / print-cell gắn vào giao diện.
// Ô phức tạp (mã HS, thuế và thu khác dồn ô, địa điểm xếp / dỡ theo PTVC, ô vận đơn, ô lựa chọn, ô nhiều dòng) vẫn sửa bằng panel.
import { AUTO_COMPUTED_KEYS, fixedPlaceCode, itemOverrides, sequenceBlocker, transportPlaceOf, type DeclarationEditMode, type DeclarationField, type LineItem } from "@kb/contracts";
import type { UiLocale } from "@kb/ui";
import { declarationLockOf, editableKeys, pendingEdits, pendingItemEdits } from "../declaration-form/dossier-adapter";
import type { FormValues } from "../declaration-form/form-state";
import { fieldLocator, isBillCell } from "./print-state";

type Kind = "IDA" | "EDA";

/** Kiểu ô nhập tại chỗ (theo kiểu chỉ tiêu). */
export type InlineInput = "text" | "number" | "date" | "code";

/** Một ô đã sửa trên bản in, chưa lưu. `line`: chỉ số dòng hàng (0-based) của tờ đang hiện. */
export type InlineDraft = { key: string; line?: number; value: string };

/** Khóa của ô (cùng dạng `data-print-cell`). */
export const draftId = (key: string, line?: number) => `${line ?? ""}:${key}`;

// Ô quy tắc tự đổi theo ô khác hoặc in dồn ô: luôn qua panel (panel áp quy tắc, hiện cả nhóm).
const PANEL_ONLY = /^(HAG_T[XRG][1-5]|HAG_CMD|TK_MTC|CON_VC1|CON_VN)$/;

/** Kiểu ô nhập tại chỗ của ô `key`, hoặc null khi ô này phải sửa bằng panel (theo loại chỉ tiêu – chưa xét khóa). */
export function inlineInputOf(kind: Kind, key: string): InlineInput | null {
  const field = fieldLocator(kind).get(key)?.field;
  if (!field || field.origin === "CUSTOMS" || field.nameOf) return null;
  if (PANEL_ONLY.test(key) || AUTO_COMPUTED_KEYS.has(key) || transportPlaceOf(kind, key) || isBillCell(kind, key)) return null;
  if (field.input === "code") return field.codeTable ? "code" : "text";
  return field.input === "text" || field.input === "number" || field.input === "date" ? field.input : null;
}

/**
 * Ô `key` (dòng `line`) nhập tại chỗ được không: đúng loại ô và đang không bị khóa – cùng quy tắc với panel
 * (chế độ sửa theo giai đoạn / tờ, Phụ lục II khi khai sửa đổi, ô theo thứ tự, mã địa điểm cố định khi PTVC 9).
 * `values`: giá trị tờ khai đang hiện kèm các ô chưa lưu (ô theo thứ tự xét theo giá trị mới).
 */
export function canEditInline(
  kind: Kind,
  key: string,
  line: number | undefined,
  ctx: { fields: Pick<DeclarationField, "code" | "value">[]; mode: DeclarationEditMode; lineMode: DeclarationEditMode; original: FormValues; values: FormValues; locale: UiLocale },
): boolean {
  if (!inlineInputOf(kind, key)) return false;
  const mode = line === undefined ? ctx.mode : ctx.lineMode;
  if (mode === "LOCKED") return false;
  const lock = declarationLockOf(kind, mode, ctx.original, editableKeys(kind, ctx.fields, mode), ctx.locale)(key);
  if (lock) return false;
  if (line !== undefined) return true;
  return !fixedPlaceCode(kind, key, ctx.values) && !sequenceBlocker(kind, key, ctx.values);
}

/** Chữ đặt sẵn trong ô nhập khi bắt đầu sửa giá trị đang có (F2): ngày YYYY-MM-DD → dd/mm/yyyy, còn lại giữ nguyên. */
export function inlineStartText(input: InlineInput, raw: string): string {
  const v = raw.trim();
  const m = input === "date" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

export type InlineParse = { ok: true; value: string } | { ok: false; reason: "DATE" | "NUMBER" };

const isRealDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Ngày người dùng gõ / dán: dd/mm/yyyy (cả d/m/yyyy, dấu "-" hoặc ".") hoặc YYYY-MM-DD → YYYY-MM-DD; trống = xóa ô. */
export function parseInlineDate(text: string): InlineParse {
  const v = text.trim();
  if (!v) return { ok: true, value: "" };
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const vn = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : vn ? [vn[3], vn[2], vn[1]] : [];
  if (!y || !m || !d || !isRealDate(Number(y), Number(m), Number(d))) return { ok: false, reason: "DATE" };
  return { ok: true, value: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` };
}

/**
 * Số người dùng gõ / dán → chuỗi số lưu (dấu "." thập phân, không phân cách nghìn); trống = xóa ô.
 * Nhận kiểu Việt Nam như bản in hiện ("20.850", "1.234,5"), kiểu Anh ("1,234.5"), số thường ("2111.04", "3,85" → 3.85). Khoảng trắng bỏ qua.
 */
export function parseInlineNumber(text: string): InlineParse {
  const v = text.replace(/\s/g, "");
  if (!v) return { ok: true, value: "" };
  const sign = v.startsWith("-") ? "-" : "";
  const body = sign ? v.slice(1) : v;
  let plain: string | null = null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(body)) plain = body.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(body)) plain = body.replace(/,/g, "");
  else if (/^\d+([.,]\d+)?$/.test(body)) plain = body.replace(",", ".");
  if (plain === null) return { ok: false, reason: "NUMBER" };
  // Bỏ số 0 thừa ở đầu phần nguyên ("007" → "7"), giữ phần thập phân như người dùng nhập.
  const [int, dec] = plain.split(".");
  const n = `${int!.replace(/^0+(?=\d)/, "")}${dec !== undefined ? `.${dec}` : ""}`;
  return { ok: true, value: `${sign}${n}` };
}

/** Chữ người dùng gõ → giá trị lưu theo kiểu ô: ngày, số; mã viết hoa; chữ bỏ khoảng trắng hai đầu. */
export function parseInline(input: InlineInput, text: string): InlineParse {
  if (input === "date") return parseInlineDate(text);
  if (input === "number") return parseInlineNumber(text);
  if (input === "code") return { ok: true, value: text.trim().toUpperCase() };
  return { ok: true, value: text.trim() };
}

/**
 * Các ô chưa lưu → danh sách chỉ tiêu cần lưu (như panel lưu): ô chung ghép lại theo chỉ tiêu app (pendingEdits), ô dòng hàng thành
 * HANG.<id dòng>.<ô> (pendingItemEdits). Ô có giá trị như đang lưu không sinh chỉ tiêu.
 */
export function inlineEdits(
  kind: Kind,
  drafts: Iterable<InlineDraft>,
  ctx: { fields: DeclarationField[]; mode: DeclarationEditMode; original: FormValues; items: Pick<LineItem, "id">[]; itemRows: FormValues[] },
): { code: string; value: string }[] {
  const decl: FormValues = {};
  const lines = new Map<number, FormValues>();
  for (const d of drafts) {
    if (d.line === undefined) decl[d.key] = d.value;
    else lines.set(d.line, { ...lines.get(d.line), [d.key]: d.value });
  }
  const out = Object.keys(decl).length > 0 ? pendingEdits(kind, ctx.original, { ...ctx.original, ...decl }, editableKeys(kind, ctx.fields, ctx.mode)) : [];
  for (const [line, changes] of lines) {
    const item = ctx.items[line];
    const row = ctx.itemRows[line];
    if (!item || !row) continue;
    out.push(...pendingItemEdits(kind, [item.id], [row], [{ ...row, ...changes }], [itemOverrides(ctx.fields, item.id)]));
  }
  return out;
}

