// Danh mục dùng ở form Tạo hồ sơ. Mã loại hình lấy từ danh mục VNACCS TYPE_CODE (@kb/contracts code-lists, QĐ 1357) – không viết cứng ở FE.
import type { CodeListEntry } from "@kb/contracts";
import { pickMessages, type ComboboxOption, type SelectOption, type UiLocale } from "@kb/ui";
import type { DocKind, Direction, Dossier } from "@/mocks/types";
import { SKILL_SET_LABELS, SUGGESTED_DOC_MESSAGES, TYPE_GROUP_LABELS } from "./create-dossier-options.messages";

/** Nhóm loại hình (như ô "Nhóm loại hình" đầu khối Tờ khai – APP_NHOM_LH): lọc danh sách mã loại hình. */
export type TypeGroup = "KD" | "SXXK" | "GC" | "CX";
const TYPE_GROUP_ORDER: TypeGroup[] = ["KD", "SXXK", "GC", "CX"];
export const typeGroupOptions = (locale: UiLocale): { value: TypeGroup; label: string }[] => {
  const t = pickMessages(TYPE_GROUP_LABELS, locale);
  return TYPE_GROUP_ORDER.map((value) => ({ value, label: t[value] }));
};
/** Bản tiếng Việt – giữ cho nơi gọi chưa truyền ngôn ngữ (steps/create-step). Nơi mới dùng typeGroupOptions(locale). */
export const TYPE_GROUPS = typeGroupOptions("vi");
/**
 * Nhóm của mã loại hình theo QĐ 1357: E1x + E42 chế xuất; E2x, E41, E5x, E82 gia công; E3x, E6x sản xuất xuất khẩu;
 * còn lại (A kinh doanh, B, C kho ngoại quan/phi thuế quan, G tạm nhập tái xuất, H khác) → Kinh doanh.
 */
export function typeGroupOf(code: string | null): TypeGroup {
  if (!code || code[0] !== "E") return "KD";
  if (/^E1\d$/.test(code) || code === "E42") return "CX";
  if (/^E[25]\d$/.test(code) || code === "E41" || code === "E82") return "GC";
  if (/^E[36]\d$/.test(code)) return "SXXK";
  return "KD";
}

/** Mã loại hình của chiều + nhóm, từ danh mục TYPE_CODE (parent = NK/XK). Tên là tên pháp lý – không dịch. */
export const typeCodesIn = (list: readonly CodeListEntry[], direction: Direction, group: TypeGroup): ComboboxOption[] =>
  list
    .filter((e) => e.parent === direction && !e.inactive && typeGroupOf(e.code) === group)
    .map((e) => ({ value: e.code, label: `${e.code} – ${e.name}` }));

/** Chi cục Hải quan từ danh mục A038 (@kb/contracts). Nhãn "mã – tên" được GỬI BACKEND làm `customsOffice` → tên pháp lý, không dịch. */
export const officeOptions = (list: readonly CodeListEntry[]): ComboboxOption[] =>
  list.filter((e) => !e.inactive).map((e) => ({ value: e.code, label: `${e.code} – ${e.name}` }));

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
