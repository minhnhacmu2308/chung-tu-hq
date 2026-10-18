// Tra cứu mã trên tờ khai (thuần): phạm vi lọc danh mục theo tờ khai đang khai, kiểu tra cứu (thả xuống / popup), tên của mã.
import { officeCodeAliases, SMALL_CODE_LIST_MAX, type CodeListEntry, type CodeListId } from "@kb/contracts";
import type { FormValues } from "./form-state";

/** parents: mã cha được giữ lại; optional: người dùng bỏ lọc được ("Chỉ hiện …"). */
export type CodeScope = { parents: string[]; label: string; optional: boolean };

/** Ô cảng/địa điểm trong nước: dỡ hàng của tờ khai nhập, xếp hàng của tờ khai xuất. */
const DOMESTIC_PLACE = new Set(["VD_DST", "TK_PSC"]);

export function codeScope(id: CodeListId, fieldKey: string, kind: "IDA" | "EDA", values: FormValues): CodeScope | null {
  const office = values["TK_CH"]?.trim();
  switch (id) {
    case "A014":
      return office ? { parents: [office], label: `bộ phận của ${office}`, optional: false } : null;
    case "A202":
      return office ? { parents: officeCodeAliases(office), label: `địa điểm thuộc cơ quan Hải quan ${office}`, optional: true } : null;
    case "TYPE_CODE":
      return kind === "IDA" ? { parents: ["NK"], label: "mã loại hình nhập khẩu", optional: false } : { parents: ["XK"], label: "mã loại hình xuất khẩu", optional: false };
    case "A016":
      return DOMESTIC_PLACE.has(fieldKey) ? { parents: ["VN"], label: "địa điểm Việt Nam", optional: true } : null;
    default:
      return null;
  }
}

/** Lọc theo phạm vi (trừ khi xem tất cả) và ẩn mã ngưng dùng; phạm vi không còn mục nào (danh mục chưa có dữ liệu của đơn vị) → cả danh mục. */
export function scopedEntries(list: readonly CodeListEntry[], scope: CodeScope | null, opts: { all: boolean; inactive: boolean }): CodeListEntry[] {
  const active = opts.inactive ? list : list.filter((e) => !e.inactive);
  if (!scope || opts.all) return [...active];
  const inScope = active.filter((e) => e.parent !== undefined && scope.parents.includes(e.parent));
  return inScope.length ? inScope : [...active];
}

/** Danh sách ngắn trong phạm vi bắt buộc → thả xuống có ô lọc; dài, hoặc phạm vi bỏ được → popup tra cứu. */
export const lookupMode = (entries: readonly CodeListEntry[], scope: CodeScope | null): "dropdown" | "dialog" =>
  (!scope || !scope.optional) && entries.length <= SMALL_CODE_LIST_MAX ? "dropdown" : "dialog";

/** Tên của mã – ưu tiên mục có mã cha trong phạm vi (mã "01" có ở nhiều chi cục), rồi mục còn hiệu lực. */
export function codeName(list: readonly CodeListEntry[], code: string, scope: CodeScope | null): string | undefined {
  const v = code.trim();
  if (!v) return undefined;
  const same = list.filter((e) => e.code === v);
  const pick = (scope && same.find((e) => e.parent !== undefined && scope.parents.includes(e.parent))) ?? same.find((e) => !e.inactive) ?? same[0];
  return pick?.name;
}
