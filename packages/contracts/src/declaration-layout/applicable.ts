// Ô bổ sung (mã chỉ tiêu = tên trường VNACCS, người khai nhập) theo tình huống: điều kiện của ô, nhóm chứa ô và khối trên bố cục.
// Cùng quy tắc DECLARATION_CONDITIONS với form và requiredGaps – backend dùng để không gửi Hải quan và bỏ giá trị khi dựng lại tờ khai
// (giống chỉ tiêu app có FieldMapping.when, Đợt 4). Thuần.
import { DECLARATION_CONDITIONS, type ConditionContext, type ConditionId } from "../declaration/conditions.js";
import { declarationFormValues, isExtraFieldKey } from "./app-fields.js";
import { itemFields } from "./expand.js";
import { layoutFor } from "./layout-for.js";
import { conditionContext } from "./required.js";

type Kind = "IDA" | "EDA";

const cache = new Map<Kind, Map<string, ConditionId[]>>();
/** Ô người khai (tab Người khai, không phải dòng hàng) → điều kiện của khối, mục (nhóm/nhóm lặp) và chính ô. */
function declarantConditions(kind: Kind): Map<string, ConditionId[]> {
  const hit = cache.get(kind);
  if (hit) return hit;
  const out = new Map<string, ConditionId[]>();
  for (const s of layoutFor(kind).declarant) for (const b of s.blocks) for (const it of b.items) {
    for (const f of itemFields(it)) {
      if (out.has(f.key)) continue;
      const ids = [b.condition, it.kind === "field" ? undefined : it.condition, f.condition].filter((c): c is ConditionId => Boolean(c));
      out.set(f.key, ids);
    }
  }
  cache.set(kind, out);
  return out;
}

/** Ô người khai đang áp dụng với dữ liệu `ctx` (ô không theo tình huống, hoặc không có trên bố cục → luôn áp dụng). */
export function declarantFieldApplicable(kind: Kind, key: string, ctx: ConditionContext): boolean {
  return (declarantConditions(kind).get(key) ?? []).every((id) => DECLARATION_CONDITIONS[id].test(ctx));
}

/**
 * Mã ô bổ sung có giá trị nhưng tình huống không áp dụng với chính giá trị tờ khai (vd 1.40 số tiếp nhận hóa đơn điện tử khi 1.39 khác D):
 * không gửi Hải quan, không chặn phê duyệt, bỏ khi dựng lại tờ khai.
 */
export function inapplicableExtraCodes(kind: Kind, fields: { code: string; value: string }[]): string[] {
  const ctx = conditionContext(kind, declarationFormValues(kind, fields));
  return fields.filter((f) => f.value.trim() && isExtraFieldKey(kind, f.code) && !declarantFieldApplicable(kind, f.code, ctx)).map((f) => f.code);
}
