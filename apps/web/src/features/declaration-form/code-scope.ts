// Tra cứu mã trên tờ khai (thuần): phạm vi lọc danh mục theo tờ khai đang khai, kiểu tra cứu (thả xuống / popup), tên của mã.
import { inPlaceScope, officeCodeAliases, SMALL_CODE_LIST_MAX, transportPlaceScope, type CodeListEntry, type CodeListId } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { FORM_MESSAGES } from "./form.messages";
import type { FormValues } from "./form-state";

/** parents: mã cha được giữ lại; match: điều kiện riêng thay cho parents (A016 theo PTVC); optional: người dùng bỏ lọc được ("Chỉ hiện …"). */
export type CodeScope = { parents: string[]; label: string; optional: boolean; match?: (e: CodeListEntry) => boolean };

const inScope = (scope: CodeScope, e: CodeListEntry) => (scope.match ? scope.match(e) : e.parent !== undefined && scope.parents.includes(e.parent));

export function codeScope(id: CodeListId, fieldKey: string, kind: "IDA" | "EDA", values: FormValues, locale: UiLocale): CodeScope | null {
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
