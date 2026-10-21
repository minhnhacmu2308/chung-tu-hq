// Logic thuần của bản mẫu tờ khai đầy đủ: ô nào đang áp dụng (theo tình huống), bộ đếm "đã nhập / tổng", ô bắt buộc còn thiếu.
import {
  conditionContext, expandRepeat, fieldRole, groupMissing, isApplicable, missingRequired,
  type ConditionContext, type ConditionId, type DeclarationLayout, type LayoutField, type LayoutItem, type LayoutSection,
} from "@kb/contracts";

type Kind = "IDA" | "EDA";
export type FormValues = Record<string, string>;

const has = (v: FormValues, key: string) => Boolean(v[key]?.trim());

// Điều kiện áp dụng và ô bắt buộc còn thiếu: quy tắc chung ở @kb/contracts (required.ts) – backend chặn duyệt/khai bằng cùng quy tắc.
export { conditionContext, groupMissing, isApplicable, missingRequired };

type Unit = { filled: boolean; missing: boolean };

/** Đơn vị đếm của một mục: mỗi ô người khai đang áp dụng (nhóm lặp chỉ dòng 1); nhóm "chỉ cần một ô" = 1 đơn vị. */
function units(kind: Kind, item: LayoutItem, v: FormValues, ctx: ConditionContext, blockCondition?: ConditionId): Unit[] {
  if (blockCondition && !isApplicable({ condition: blockCondition }, ctx)) return [];
  if (!isApplicable(item, ctx)) return [];
  if (item.kind === "group" && item.fill === "any") return [{ filled: item.fields.some((f) => has(v, f.key)), missing: groupMissing(kind, item, v, ctx, blockCondition) }];
  const fields = item.kind === "field" ? [item] : item.kind === "group" ? item.fields : (expandRepeat(item)[0] ?? []);
  const parentNo = item.kind === "field" ? undefined : item.no;
  const parentCondition = item.kind === "field" ? blockCondition : item.condition ?? blockCondition;
  return fields
    .filter((f) => f.origin !== "CUSTOMS" && isApplicable(f, ctx))
    .map((f) => ({ filled: has(v, f.key), missing: missingRequired(kind, f, v, parentNo, parentCondition, ctx) }));
}

export function sectionProgress(kind: Kind, s: LayoutSection, v: FormValues): { filled: number; total: number; missingRequired: number } {
  const ctx = conditionContext(kind, v);
  const all = s.blocks.flatMap((b) => b.items.flatMap((it) => units(kind, it, v, ctx, b.condition)));
  return { total: all.length, filled: all.filter((u) => u.filled).length, missingRequired: all.filter((u) => u.missing).length };
}

/** Số ô bắt buộc còn thiếu của một dòng hàng (điều kiện xét theo giá trị của chính dòng). */
export function itemProgress(kind: Kind, layout: DeclarationLayout, item: FormValues): { missing: number } {
  return { missing: sectionProgress(kind, { id: "item", title: "", blocks: layout.item.declarant }, item).missingRequired };
}

/** Ô lựa chọn: bắt buộc → radio (luôn có một giá trị); không bắt buộc → checkbox chọn một, bấm lại để bỏ chọn. */
export const choiceControl = (kind: Kind, f: LayoutField, parentNo?: string): "radio" | "checkbox" => (fieldRole(kind, f, parentNo) === "REQUIRED" ? "radio" : "checkbox");

/** Bấm một checkbox của ô lựa chọn: ô đang chọn → bỏ chọn; ô khác → chọn ô đó (bỏ ô cũ). */
export const toggleChoice = (current: string, value: string) => (current === value ? "" : value);
