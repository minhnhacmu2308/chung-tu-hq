// Trạng thái màn bản mẫu lưu trên URL (F5 / chia sẻ link vẫn đúng chỗ): loại tờ khai, giai đoạn, tab, nhóm. Thuần.
import { itemFields, layoutFor, type LayoutBlock } from "@kb/contracts";
import type { Stage } from "./fixtures";
import type { FormValues } from "./form-state";

export type Tab = "khai" | "hai-quan" | "nghiep-vu";
export type ViewState = { kind: "IDA" | "EDA"; stage: Stage; tab: Tab; section: string };
/** Nhóm 8 của tab Người khai nhập (không nằm trong cấu hình bố cục). */
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
