// Trạng thái màn bản mẫu lưu trên URL (F5 / chia sẻ link vẫn đúng chỗ): loại tờ khai, giai đoạn, tab, nhóm. Thuần.
import { itemFields, layoutFor, type DeclarationLayout, type LayoutBlock } from "@kb/contracts";
import { pickMessages, type UiLocale } from "@kb/ui";
import type { Stage } from "./fixtures";
import { FORM_MESSAGES } from "./form.messages";
import type { FormValues } from "./form-state";

export type Tab = "khai" | "hai-quan" | "nghiep-vu";
export type ViewState = { kind: "IDA" | "EDA"; stage: Stage; tab: Tab; section: string };
/** Nhóm "Danh sách hàng" của tab Người khai nhập (không nằm trong cấu hình bố cục). */
export const ITEMS_SECTION = "hang";

const STAGES: readonly Stage[] = ["nhap", "da-khai", "thong-quan"];
const TABS: readonly Tab[] = ["khai", "hai-quan", "nghiep-vu"];

export function parseView(p: { get(name: string): string | null }): ViewState {
  const kind = p.get("loai") === "xuat" ? "EDA" : "IDA";
  const stage = (STAGES as readonly string[]).includes(p.get("giai-doan") ?? "") ? (p.get("giai-doan") as Stage) : "nhap";
  const tab = (TABS as readonly string[]).includes(p.get("tab") ?? "") ? (p.get("tab") as Tab) : "khai";
  const ids = [...layoutFor(kind).declarant.map((s) => s.id), ITEMS_SECTION];
  const nhom = p.get("nhom") ?? "";
  return { kind, stage, tab, section: ids.includes(nhom) ? nhom : ids[0]! };
}

export const toQuery = (v: ViewState) =>
  new URLSearchParams({ loai: v.kind === "EDA" ? "xuat" : "nhap", "giai-doan": v.stage, tab: v.tab, nhom: v.section }).toString();

/** Khối có ít nhất một ô có giá trị (khối Hải quan không có → hiện câu "Có sau khi …"). */
export const blockHasData = (b: LayoutBlock, v: FormValues) => b.items.flatMap(itemFields).some((f) => Boolean(v[f.key]?.trim()));

/** Nhóm của tab Người khai nhập theo thứ tự hiển thị: "Danh sách hàng" đứng trước "Đính kèm & ghi chú" (nhóm cuối), số thứ tự đánh lại. */
export function navSections(layout: DeclarationLayout, locale: UiLocale): { id: string; title: string }[] {
  const ids = layout.declarant.map((s) => ({ id: s.id, title: s.title }));
  const at = ids.findIndex((s) => s.id === "dinh-kem");
  ids.splice(at < 0 ? ids.length : at, 0, { id: ITEMS_SECTION, title: pickMessages(FORM_MESSAGES, locale).itemsSection });
  return ids.map((s, i) => ({ id: s.id, title: `${i + 1}. ${s.title}` }));
}
