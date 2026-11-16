// Quy tắc gọn diện tích của lưới chỉ tiêu tờ khai (thuần): bề rộng nhóm ô.
import type { LayoutGroup } from "@kb/contracts";

/** Nhóm 2–3 ô ngắn (số + đơn vị, mã + tên) chiếm nửa hàng thay vì cả hàng; có ô rộng / nhiều dòng hoặc từ 4 ô thì cả hàng. */
export function groupSpan(g: LayoutGroup): "half" | "full" {
  return g.fields.length >= 4 || g.fields.some((f) => f.width === "lg" || f.width === "full" || f.input === "textarea") ? "full" : "half";
}
