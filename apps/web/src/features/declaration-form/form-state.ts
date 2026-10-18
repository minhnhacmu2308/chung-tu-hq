// Logic thuần của bản mẫu tờ khai đầy đủ: ô nào đang áp dụng (theo tình huống), bộ đếm "đã nhập / tổng", ô bắt buộc còn thiếu.
import {
  DECLARATION_CONDITIONS, expandRepeat, fieldRole,
  type ConditionContext, type ConditionId, type DeclarationLayout, type LayoutField, type LayoutGroup, type LayoutItem, type LayoutSection,
} from "@kb/contracts";

type Kind = "IDA" | "EDA";
export type FormValues = Record<string, string>;

const has = (v: FormValues, key: string) => Boolean(v[key]?.trim());

/** Dữ liệu xét điều kiện lấy từ chính giá trị trên form (đổi loại hình/phương thức vận chuyển, định danh, HAWB → ô ẩn/hiện ngay). */
export function conditionContext(kind: Kind, v: FormValues): ConditionContext {
  return {
    typeCode: (kind === "IDA" ? v["TK_ICB"] : v["TK_ECB"]) ?? "",
    transportCode: v["TK_MTC"] ?? "",
    incoterm: (v["TK_IP2"] ?? "").trim().toUpperCase(),
    hasInvoice: v["TK_IV1"] !== "B" && has(v, "TK_IV3"),
    identMode: v["APP_DD_PT"] ?? "",
    hawbIssued: v["APP_HAWB_CO"] === "CO",
    splitCargo: v["TVD_LOAIHANG"] ?? "",
    manualValue: v["APP_TGTT_TAY"] === "1",
  };
}

export const isApplicable = (x: { condition?: ConditionId | undefined }, ctx: ConditionContext) => !x.condition || DECLARATION_CONDITIONS[x.condition].test(ctx);

/**
 * Ô bắt buộc còn trống: vai trò "Bắt buộc", hoặc "Theo tình huống" mà ô (hay nhóm/khối chứa ô) có điều kiện ĐANG áp dụng.
 * Điều kiện không áp dụng (ô hiện mờ khi bật "hiện cả chỉ tiêu không áp dụng") → không báo thiếu.
 * Ô "theo tình huống" không gắn điều kiện cụ thể (ví dụ số hóa đơn) không bị coi là thiếu – tránh báo sai.
 */
export function missingRequired(kind: Kind, f: LayoutField, v: FormValues, parentNo: string | undefined, parentCondition: ConditionId | undefined, ctx: ConditionContext): boolean {
  if (f.origin === "CUSTOMS" || has(v, f.key)) return false;
  const condition = f.condition ?? parentCondition;
  if (condition && !DECLARATION_CONDITIONS[condition].test(ctx)) return false;
  const role = fieldRole(kind, f, parentNo);
  return role === "REQUIRED" || (role === "CONDITIONAL" && Boolean(condition));
}

/** Nhóm "chỉ cần một ô" (fill: any) còn thiếu: đang áp dụng, chưa ô nào có giá trị, và chỉ tiêu bắt buộc trong tình huống này. */
export function groupMissing(kind: Kind, g: LayoutGroup, v: FormValues, ctx: ConditionContext, blockCondition?: ConditionId): boolean {
  if (g.fields.some((f) => has(v, f.key))) return false;
  return g.fields.some((f) => missingRequired(kind, f, v, g.no, g.condition ?? blockCondition, ctx));
}

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
