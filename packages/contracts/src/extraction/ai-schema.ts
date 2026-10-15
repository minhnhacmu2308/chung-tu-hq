// Bản schema gửi cho AI (structured output). API Claude giới hạn 16 tham số kiểu union trong một schema;
// trường nullable cũng là union, nên trường chữ/ngày nullable được gửi dạng chuỗi ("" = không có).
// Kết quả nhận về chạy emptyToNull rồi parse bằng schema gốc → kiểu dữ liệu trong app không đổi.
import { z, type ZodType } from "zod";

const DATE_OR_EMPTY = /^(\d{4}-\d{2}-\d{2})?$/;
const NUMBER_OR_EMPTY = /^(-?\d+(\.\d+)?)?$/;
const withDesc = <T extends ZodType>(s: T, desc: string | undefined) => (desc ? (s.describe(desc) as T) : s);

// Trường bổ sung (`custom`) do doanh nghiệp tự thêm, tới 20 trường: số nullable trong đó cũng gửi dạng chuỗi
// để không vượt giới hạn union; fromAiOutput đổi lại thành số.
export function toAiOutputSchema(schema: ZodType, inCustom = false): ZodType {
  const desc = schema.description;
  if (schema instanceof z.ZodObject) {
    const shape = Object.fromEntries(Object.entries(schema.shape as Record<string, ZodType>).map(([k, v]) => [k, toAiOutputSchema(v, inCustom || k === "custom")]));
    return withDesc(z.object(shape), desc);
  }
  if (schema instanceof z.ZodArray) return withDesc(z.array(toAiOutputSchema(schema.element as ZodType, inCustom)), desc);
  if (schema instanceof z.ZodNullable) {
    const inner = schema.unwrap() as ZodType;
    if (inCustom && inner instanceof z.ZodNumber) return z.string().regex(NUMBER_OR_EMPTY).describe(`${desc ?? ""} – số dạng 1234.5, chuỗi rỗng nếu không có trên chứng từ`.trim());
    if (inner instanceof z.ZodString) {
      const isDate = /YYYY-MM-DD/.test(desc ?? "");
      return (isDate ? z.string().regex(DATE_OR_EMPTY) : z.string()).describe(`${desc ?? ""} – chuỗi rỗng nếu không có trên chứng từ`.trim());
    }
    if (inner instanceof z.ZodObject || inner instanceof z.ZodArray) return withDesc(toAiOutputSchema(inner, inCustom).nullable(), desc);
  }
  return schema;
}

/** Chuỗi rỗng ("không có" theo toAiOutputSchema) → null, đệ quy. */
export function emptyToNull(value: unknown): unknown {
  if (value === "") return null;
  if (Array.isArray(value)) return value.map(emptyToNull);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, emptyToNull(v)]));
  return value;
}

/** Kết quả AI (theo toAiOutputSchema) → dạng của schema gốc: "" → null, số gửi dạng chuỗi → số. */
export function fromAiOutput(schema: ZodType, value: unknown): unknown {
  return coerceNumbers(schema, emptyToNull(value));
}

function coerceNumbers(schema: ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) return value === null || value === undefined ? value : coerceNumbers(schema.unwrap() as ZodType, value);
  if (schema instanceof z.ZodObject && value && typeof value === "object" && !Array.isArray(value)) {
    const shape = schema.shape as Record<string, ZodType>;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape[k] ? coerceNumbers(shape[k], v) : v]));
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) return value.map((v) => coerceNumbers(schema.element as ZodType, v));
  if (schema instanceof z.ZodNumber && typeof value === "string" && NUMBER_OR_EMPTY.test(value)) return Number(value);
  return value;
}
