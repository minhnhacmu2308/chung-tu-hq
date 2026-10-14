// Chuyển nhãn mẫu (expected theo key trường skill) ↔ giá trị ô nhập. Thuần, có test.
import type { SkillField } from "@kb/contracts";

/** Trường đọc được và sửa bằng một ô nhập. Bên (party) và bảng hàng (items) là dữ liệu có cấu trúc – giữ nguyên, chưa sửa ở màn này. */
export const isScalarField = (f: SkillField) => f.extract && f.type !== "party" && f.type !== "items";

const isScalarValue = (v: unknown) => v === null || v === undefined || typeof v === "string" || typeof v === "number";

/** Các trường sửa được trên màn + giá trị hiện có ("" khi chưa có). Trường vô hướng nhưng nhãn đang là object/mảng thì bỏ qua để không làm hỏng. */
export function toFormValues(fields: SkillField[], expected: Record<string, unknown> | null): { field: SkillField; value: string }[] {
  return fields
    .filter(isScalarField)
    .filter((f) => isScalarValue(expected?.[f.key]))
    .map((f) => ({ field: f, value: expected?.[f.key] == null ? "" : String(expected[f.key]) }));
}

/** Ghép giá trị đã sửa vào nhãn cũ: ô trống → null, key không nằm trên màn giữ nguyên. */
export function toExpected(expected: Record<string, unknown> | null, values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(expected ?? {}) };
  for (const [key, raw] of Object.entries(values)) out[key] = raw.trim() === "" ? null : raw.trim();
  return out;
}

/** Số trường có cấu trúc (bên, bảng hàng) không sửa được ở màn này. */
export const structuredCount = (fields: SkillField[]) => fields.filter((f) => f.extract && !isScalarField(f)).length;
