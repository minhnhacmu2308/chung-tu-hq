// Danh mục dùng ở form Tạo hồ sơ (prototype: cố định; bản thật lấy từ danh mục Hải quan).
import { pickMessages, type ComboboxOption, type SelectOption, type UiLocale } from "@kb/ui";
import type { DocKind, Direction, Dossier } from "@/mocks/types";
import { SKILL_SET_LABELS, SUGGESTED_DOC_MESSAGES, TYPE_CODE_LABELS, TYPE_GROUP_LABELS } from "./create-dossier-options.messages";

type TypeCodeKey = keyof (typeof TYPE_CODE_LABELS)["vi"];
type TypeCode = Exclude<TypeCodeKey, `${string}_desc`>;

/** Mã loại hình theo chiều; nhãn lấy theo ngôn ngữ (TYPE_CODE_LABELS), mã có mô tả phụ đánh dấu `desc`. */
const TYPE_CODES: Record<Direction, { code: TypeCode; desc?: true }[]> = {
  NK: [
    { code: "A11", desc: true }, { code: "A12", desc: true }, { code: "A21" }, { code: "A31" }, { code: "A41" },
    { code: "E11" }, { code: "E21" }, { code: "E31" }, { code: "E41" }, { code: "G11" }, { code: "G12" }, { code: "G13" },
  ],
  XK: [
    { code: "B11", desc: true }, { code: "B12" }, { code: "B13" }, { code: "E42" }, { code: "E52" }, { code: "E62" }, { code: "G21" }, { code: "G61" },
  ],
};

/** Nhóm loại hình (như ô "Nhóm loại hình" đầu khối Tờ khai – APP_NHOM_LH): lọc danh sách mã loại hình. */
export type TypeGroup = "KD" | "SXXK" | "GC" | "CX";
const TYPE_GROUP_ORDER: TypeGroup[] = ["KD", "SXXK", "GC", "CX"];
export const typeGroupOptions = (locale: UiLocale): { value: TypeGroup; label: string }[] => {
  const t = pickMessages(TYPE_GROUP_LABELS, locale);
  return TYPE_GROUP_ORDER.map((value) => ({ value, label: t[value] }));
};
/** Bản tiếng Việt – giữ cho nơi gọi chưa truyền ngôn ngữ (steps/create-step). Nơi mới dùng typeGroupOptions(locale). */
export const TYPE_GROUPS = typeGroupOptions("vi");
const GROUP_OF: Record<string, TypeGroup> = { E11: "CX", E42: "CX", E21: "GC", E41: "GC", E52: "GC", E31: "SXXK", E62: "SXXK" };
/** Nhóm của mã loại hình; mã không thuộc loại hình E (kinh doanh, tạm nhập tái xuất…) → Kinh doanh. */
export const typeGroupOf = (code: string | null): TypeGroup => (code && GROUP_OF[code]) || "KD";
export const typeCodesIn = (direction: Direction, group: TypeGroup, locale: UiLocale = "vi"): ComboboxOption[] => {
  const t = pickMessages(TYPE_CODE_LABELS, locale);
  return TYPE_CODES[direction]
    .filter((o) => typeGroupOf(o.code) === group)
    .map((o) => ({ value: o.code, label: `${o.code} – ${t[o.code]}`, ...(o.desc ? { description: t[`${o.code}_desc` as TypeCodeKey] } : {}) }));
};

export { CUSTOMS_OFFICES } from "./create-dossier-options.vi";

export function skillSetOptions(locale: UiLocale): SelectOption[] {
  const t = pickMessages(SKILL_SET_LABELS, locale);
  return [
    { value: "default", label: t.default },
    { value: "supplier-hansol", label: `${t.bySupplier} – HANSOL PRECISION` },
    { value: "supplier-artemide", label: `${t.bySupplier} – ARTEMIDE (EU, REX)` },
  ];
}

export type SuggestedDoc = { kind: DocKind; name: string; note: string; important?: boolean };

/** Danh sách chứng từ gợi ý theo loại hồ sơ. Chỉ là gợi ý – không chặn khi thiếu (PRODUCT.md bước 1). */
export function suggestedDocuments(direction: Direction, mode: Dossier["transportMode"], locale: UiLocale = "vi"): SuggestedDoc[] {
  const t = pickMessages(SUGGESTED_DOC_MESSAGES, locale);
  const docs: SuggestedDoc[] = [
    { kind: "INVOICE", name: "Commercial Invoice", note: t.invoiceNote, important: true },
    { kind: "PACKING_LIST", name: "Packing List", note: t.packingNote },
  ];
  if (mode === "SEA_CONTAINER") docs.push({ kind: "BILL_OF_LADING", name: "Bill of Lading", note: t.blContainerNote, important: true });
  if (mode === "SEA_BULK") docs.push({ kind: "BILL_OF_LADING", name: "Bill of Lading", note: t.blBulkNote, important: true });
  if (mode === "AIR") docs.push({ kind: "AIR_WAYBILL", name: "Air Waybill (MAWB/HAWB)", note: t.awbNote, important: true });
  if (mode === "ROAD") docs.push({ kind: "OTHER", name: t.roadName, note: t.roadNote });
  if (mode === "RAIL") docs.push({ kind: "OTHER", name: t.railName, note: t.railNote });
  if (mode === "RIVER") docs.push({ kind: "OTHER", name: t.riverName, note: t.riverNote });
  if (mode === "OTHER") docs.push({ kind: "OTHER", name: t.otherName, note: t.otherNote });
  if (direction === "NK") {
    docs.push({ kind: "ARRIVAL_NOTICE", name: "Arrival Notice", note: t.arrivalNote });
    // Điều kiện giao hàng chỉ biết sau khi đọc invoice → gợi ý theo điều kiện, không đánh dấu "Nên có".
    docs.push({ kind: "FREIGHT_INVOICE", name: t.freightName, note: t.freightNote });
    docs.push({ kind: "CERT_OF_ORIGIN", name: t.coName, note: t.coNote });
  }
  docs.push({ kind: "SALES_CONTRACT", name: "Sales Contract", note: t.contractNote });
  return docs;
}
