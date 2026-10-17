// Logic thuần của bản mẫu tờ khai đầy đủ: ô nào đang áp dụng (theo tình huống), bộ đếm "đã nhập / tổng", ô bắt buộc còn thiếu.
import {
  DECLARATION_CONDITIONS, expandRepeat, fieldRole,
  type ConditionContext, type ConditionId, type DeclarationLayout, type LayoutField, type LayoutItem, type LayoutSection,
} from "@kb/contracts";

type Kind = "IDA" | "EDA";
export type FormValues = Record<string, string>;

const has = (v: FormValues, key: string) => Boolean(v[key]?.trim());

/** Dữ liệu xét điều kiện lấy từ chính giá trị trên form (đổi loại hình/phương thức vận chuyển → ô ẩn/hiện ngay). */
export function conditionContext(kind: Kind, v: FormValues): ConditionContext {
  return {
    typeCode: (kind === "IDA" ? v["TK_ICB"] : v["TK_ECB"]) ?? "",
    transportCode: v["TK_MTC"] ?? "",
    incoterm: (v["TK_IP2"] ?? "").trim().toUpperCase(),
    hasInvoice: v["TK_IV1"] !== "B" && has(v, "TK_IV3"),
  };
}

export const isApplicable = (x: { condition?: ConditionId | undefined }, ctx: ConditionContext) => !x.condition || DECLARATION_CONDITIONS[x.condition].test(ctx);

/**
 * Ô bắt buộc còn trống: vai trò "Bắt buộc", hoặc "Theo tình huống" mà ô (hay nhóm chứa ô) có điều kiện đang áp dụng.
 * Ô "theo tình huống" không gắn điều kiện cụ thể (ví dụ số hóa đơn) không bị coi là thiếu – tránh báo sai.
 */
export function missingRequired(kind: Kind, f: LayoutField, v: FormValues, parentNo?: string, parentCondition?: ConditionId): boolean {
  if (f.origin === "CUSTOMS" || has(v, f.key)) return false;
  const role = fieldRole(kind, f, parentNo);
  return role === "REQUIRED" || (role === "CONDITIONAL" && Boolean(f.condition ?? parentCondition));
}

type Counted = { field: LayoutField; parentNo: string | undefined; parentCondition: ConditionId | undefined };

/** Ô người khai đang áp dụng của một mục (nhóm lặp chỉ tính dòng 1). */
function applicableFields(item: LayoutItem, ctx: ConditionContext, blockCondition?: ConditionId): Counted[] {
  if (blockCondition && !isApplicable({ condition: blockCondition }, ctx)) return [];
  if (!isApplicable(item, ctx)) return [];
  const fields = item.kind === "field" ? [item] : item.kind === "group" ? item.fields : (expandRepeat(item)[0] ?? []);
  const parentNo = item.kind === "field" ? undefined : item.no;
  const parentCondition = item.kind === "field" ? blockCondition : item.condition ?? blockCondition;
  return fields.filter((f) => f.origin !== "CUSTOMS" && isApplicable(f, ctx)).map((field) => ({ field, parentNo, parentCondition }));
}

export function sectionProgress(kind: Kind, s: LayoutSection, v: FormValues): { filled: number; total: number; missingRequired: number } {
  const ctx = conditionContext(kind, v);
  const counted = s.blocks.flatMap((b) => b.items.flatMap((it) => applicableFields(it, ctx, b.condition)));
  return {
    total: counted.length,
    filled: counted.filter((c) => has(v, c.field.key)).length,
    missingRequired: counted.filter((c) => missingRequired(kind, c.field, v, c.parentNo, c.parentCondition)).length,
  };
}

/** Số ô bắt buộc còn thiếu của một dòng hàng (điều kiện xét theo giá trị của chính dòng). */
export function itemProgress(kind: Kind, layout: DeclarationLayout, item: FormValues): { missing: number } {
  return { missing: sectionProgress(kind, { id: "item", title: "", blocks: layout.item.declarant }, item).missingRequired };
}
