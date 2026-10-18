// Quy tắc gọn diện tích của bản mẫu tờ khai (thuần): chế độ hiển thị “Ô cần nhập”, khối trống đóng sẵn, bề rộng nhóm ô, nhóm trước/sau.
import { DECLARATION_CONDITIONS, expandRepeat, fieldRole, type ConditionContext, type ConditionId, type LayoutBlock, type LayoutField, type LayoutGroup, type LayoutItem } from "@kb/contracts";
import type { FormValues } from "./form-state";

type Kind = "IDA" | "EDA";
/** can-nhap: chỉ ô bắt buộc, ô theo tình huống đang áp dụng và ô đã có dữ liệu · ap-dung: mọi ô đang áp dụng · tat-ca: cả ô không áp dụng (hiện mờ). */
export type ViewMode = "can-nhap" | "ap-dung" | "tat-ca";

const has = (v: FormValues, key: string) => Boolean(v[key]?.trim());

/** Ô người khai cần để mắt tới: đã có giá trị, bắt buộc, hoặc theo tình huống mà điều kiện đang áp dụng. */
function essential(kind: Kind, f: LayoutField, v: FormValues, parentNo: string | undefined, parentCondition: ConditionId | undefined, ctx: ConditionContext): boolean {
  if (f.origin === "CUSTOMS") return false;
  if (has(v, f.key)) return true;
  const condition = f.condition ?? parentCondition;
  if (condition && !DECLARATION_CONDITIONS[condition].test(ctx)) return false;
  const role = fieldRole(kind, f, parentNo);
  return role === "REQUIRED" || (role === "CONDITIONAL" && Boolean(condition));
}

export function itemVisible(mode: ViewMode, kind: Kind, item: LayoutItem, v: FormValues, ctx: ConditionContext, blockCondition: ConditionId | undefined): boolean {
  if (mode !== "can-nhap") return true;
  if (item.kind === "field") return essential(kind, item, v, undefined, blockCondition, ctx);
  const condition = item.condition ?? blockCondition;
  if (item.kind === "group") return item.fields.some((f) => essential(kind, f, v, item.no, condition, ctx));
  const rows = expandRepeat(item);
  return rows.some((r) => r.some((f) => has(v, f.key))) || (rows[0] ?? []).some((f) => essential(kind, f, v, item.no, condition, ctx));
}

/** Khối người khai chưa có dữ liệu và không có ô cần nhập (hạn mức, bảo lãnh, trung chuyển…) → đóng sẵn, bấm để mở. */
export function blockCollapsedByDefault(kind: Kind, block: LayoutBlock, v: FormValues, ctx: ConditionContext): boolean {
  const fields = block.items.flatMap((it) => (it.kind === "field" ? [it] : it.fields));
  if (fields.every((f) => f.origin === "CUSTOMS")) return false;
  return !block.items.some((it) => itemVisible("can-nhap", kind, it, v, ctx, block.condition));
}

/** Nhóm 2–3 ô ngắn (số + đơn vị, mã + tên) chiếm nửa hàng thay vì cả hàng; có ô rộng / nhiều dòng hoặc từ 4 ô thì cả hàng. */
export function groupSpan(g: LayoutGroup): "half" | "full" {
  return g.fields.length >= 4 || g.fields.some((f) => f.width === "lg" || f.width === "full" || f.input === "textarea") ? "full" : "half";
}

export function neighborSections<T extends { id: string }>(nav: T[], current: string): { prev: T | undefined; next: T | undefined } {
  const i = nav.findIndex((n) => n.id === current);
  return { prev: i > 0 ? nav[i - 1] : undefined, next: i >= 0 ? nav[i + 1] : undefined };
}
