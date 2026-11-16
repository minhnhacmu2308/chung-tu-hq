// Tra cứu mã trên tờ khai (thuần): phạm vi lọc danh mục theo tờ khai đang khai, kiểu tra cứu (thả xuống / popup), tên của mã.
import { amaOtherTaxSlotOf, inPlaceScope, OTHER_TAX_GROUPS, officeCodeAliases, otherTaxGroupOf, SMALL_CODE_LIST_MAX, transportPlaceScope, type CodeListEntry, type CodeListId } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { FORM_MESSAGES } from "./form.messages";
import { OTHER_TAX_MESSAGES } from "./other-tax.messages";
import type { FormValues } from "./form-state";

/** parents: mã cha được giữ lại; match: điều kiện riêng thay cho parents (A016 theo PTVC); optional: người dùng bỏ lọc được ("Chỉ hiện …"). */
export type CodeScope = { parents: string[]; label: string; optional: boolean; match?: (e: CodeListEntry) => boolean };

const inScope = (scope: CodeScope, e: CodeListEntry) => (scope.match ? scope.match(e) : e.parent !== undefined && scope.parents.includes(e.parent));

/** Ô của khối "thuế và thu khác" (HAG_TX/TR/TG 1..5) → số dòng (= loại thuế); ô khác → undefined. */
const otherTaxRowOf = (fieldKey: string): number | undefined => {
  const m = /^HAG_T[XRG]([1-5])$/.exec(fieldKey);
  return m ? Number(m[1]) : undefined;
};

/** Mã thuế (HAG_TX{n}) của dòng chứa ô `fieldKey` – đủ để lọc mã; ô ngoài khối → undefined. Chuỗi gọn để useMemo không tính lại khi gõ ô khác. */
export function otherTaxRow(fieldKey: string, values: FormValues): { key: string; code: string } | undefined {
  // Bản khai bổ sung (AMA): ô HAG_MK/AK{n} lọc theo nhóm của mã "Trước" HAG_MK{n} (chưa có mã Trước → không lọc).
  const slot = amaOtherTaxSlotOf(fieldKey);
  if (slot !== null) return { key: `HAG_MK${slot}`, code: values[`HAG_MK${slot}`] ?? "" };
  const n = otherTaxRowOf(fieldKey);
  return n === undefined ? undefined : { key: `HAG_TX${n}`, code: values[`HAG_TX${n}`] ?? "" };
}

/** Mã thuế / mã miễn giảm của dòng n: chỉ các mã có chữ cái đầu của loại thuế đó (mã miễn/giảm: theo chữ đầu của mã thuế cùng dòng nếu đã nhập). */
function otherTaxScope(id: CodeListId, fieldKey: string, rowValues: FormValues | undefined, locale: UiLocale): CodeScope | null {
  const amaSlot = amaOtherTaxSlotOf(fieldKey);
  if (amaSlot !== null) {
    const g = OTHER_TAX_GROUPS.find((x) => x.group === otherTaxGroupOf(rowValues?.[`HAG_MK${amaSlot}`]));
    return g ? { parents: [], label: fill(pickMessages(OTHER_TAX_MESSAGES, locale).scopeLetters, { letters: g.taxPrefixes.join("/") }), optional: false, match: (e) => g.taxPrefixes.includes(e.code.charAt(0).toUpperCase()) } : null;
  }
  const n = otherTaxRowOf(fieldKey);
  const group = OTHER_TAX_GROUPS.find((g) => g.group === n);
  if (!group || (id === "A520" && !fieldKey.startsWith("HAG_TR"))) return null;
  const typed = id === "A520" ? rowValues?.[`HAG_TX${n}`]?.trim().toUpperCase().charAt(0) : "";
  const letters = typed && group.taxPrefixes.includes(typed) ? [typed] : [...group.taxPrefixes];
  return { parents: [], label: fill(pickMessages(OTHER_TAX_MESSAGES, locale).scopeLetters, { letters: letters.join("/") }), optional: false, match: (e) => letters.includes(e.code.charAt(0).toUpperCase()) };
}

export function codeScope(id: CodeListId, fieldKey: string, kind: "IDA" | "EDA", values: FormValues, locale: UiLocale, rowValues?: FormValues): CodeScope | null {
  const office = values["TK_CH"]?.trim();
  const t = pickMessages(FORM_MESSAGES, locale);
  switch (id) {
    case "A014":
      return office ? { parents: [office], label: fill(t.scopeDept, { office }), optional: false } : null;
    case "A202":
      return office ? { parents: officeCodeAliases(office), label: fill(t.scopePlace, { office }), optional: true } : null;
    case "TYPE_CODE":
      return kind === "IDA" ? { parents: ["NK"], label: t.scopeImportType, optional: false } : { parents: ["XK"], label: t.scopeExportType, optional: false };
    case "A016": {
      // Nhập: dỡ hàng = Việt Nam, xếp hàng = nước ngoài; xuất: ngược lại. Trong nước theo PTVC (1.6 / 2.6). PTVC 9: mã cố định VNZZZ (ô khóa) – không lọc.
      const s = transportPlaceScope(kind, fieldKey, values);
      if (!s || "onSite" in s) return null;
      const label = !s.domestic ? t.scopeAbroad : s.mode ? fill(t.scopeVnMode, { mode: s.mode }) : t.scopeVn;
      return { parents: s.domestic ? ["VN"] : [], label, optional: false, match: (e) => inPlaceScope(s, e) };
    }
    case "OTHER_TAX":
    case "A520":
      return otherTaxScope(id, fieldKey, rowValues, locale);
    default:
      return null;
  }
}

/** Lọc theo phạm vi (trừ khi xem tất cả) và ẩn mã ngưng dùng; phạm vi không còn mục nào (danh mục chưa có dữ liệu của đơn vị) → cả danh mục. */
export function scopedEntries(list: readonly CodeListEntry[], scope: CodeScope | null, opts: { all: boolean; inactive: boolean }): CodeListEntry[] {
  const active = opts.inactive ? list : list.filter((e) => !e.inactive);
  if (!scope || opts.all) return [...active];
  const kept = active.filter((e) => inScope(scope, e));
  return kept.length ? kept : [...active];
}

/** Danh sách ngắn trong phạm vi bắt buộc → thả xuống có ô lọc; dài, hoặc phạm vi bỏ được → popup tra cứu. */
export const lookupMode = (entries: readonly CodeListEntry[], scope: CodeScope | null): "dropdown" | "dialog" =>
  (!scope || !scope.optional) && entries.length <= SMALL_CODE_LIST_MAX ? "dropdown" : "dialog";

/** Tên của mã – ưu tiên mục có mã cha trong phạm vi (mã "01" có ở nhiều chi cục), rồi mục còn hiệu lực. */
export function codeName(list: readonly CodeListEntry[], code: string, scope: CodeScope | null): string | undefined {
  const v = code.trim();
  if (!v) return undefined;
  const same = list.filter((e) => e.code === v);
  const pick = (scope && same.find((e) => inScope(scope, e))) ?? same.find((e) => !e.inactive) ?? same[0];
  return pick?.name;
}
