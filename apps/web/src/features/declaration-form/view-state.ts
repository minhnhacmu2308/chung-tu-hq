// Trạng thái hiển thị khối của bố cục tờ khai (thuần).
import { itemFields, type LayoutBlock } from "@kb/contracts";
import type { FormValues } from "./form-state";

/** Khối có ít nhất một ô có giá trị (khối Hải quan không có → hiện câu "Có sau khi …"). */
export const blockHasData = (b: LayoutBlock, v: FormValues) => b.items.flatMap(itemFields).some((f) => Boolean(v[f.key]?.trim()));
