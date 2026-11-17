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
    const shape = Object.fromEntries(Object.entries(schema.shape as Record<string, ZodType>).map(([k, v]) => [k, k === "lot" && v instanceof z.ZodObject ? lotToAi(v) : toAiOutputSchema(v, inCustom || k === "custom")]));
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

// Khối lô hàng gửi dạng mảng chỉ liệt kê ô có in: chứng từ không in thông tin lô hàng gần như không tốn thêm đầu ra.
// Enum không tính là union. Mô tả từng ô đi kèm mô tả mảng vì mảng {key,value} không mang mô tả trường.
function lotToAi(lot: z.ZodObject): ZodType {
  const shape = lot.shape as Record<string, ZodType>;
  const keys = Object.keys(shape) as [string, ...string[]];
  const legend = keys.map((k) => `${k}: ${shape[k]!.description ?? ""}`).join("; ");
  return z.array(z.object({ key: z.enum(keys), value: z.string() })).describe(`Chỉ liệt kê thông tin lô hàng CÓ IN trên chứng từ; không in thì mảng rỗng. ${legend}`);
}

/** Mảng `lot` từ AI → object đủ key của schema gốc: thiếu = null, key trùng lấy giá trị đầu, key lạ bỏ. */
function lotFromAi(schema: ZodType, value: unknown): unknown {
  const lot = schema instanceof z.ZodObject ? (schema.shape as Record<string, ZodType>)["lot"] : undefined;
  if (!(lot instanceof z.ZodObject) || !value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>)["lot"])) return value;
  const out: Record<string, unknown> = Object.fromEntries(Object.keys(lot.shape).map((k) => [k, null]));
  for (const e of (value as { lot: { key?: unknown; value?: unknown }[] }).lot) {
    if (typeof e?.key === "string" && e.key in out && out[e.key] === null) out[e.key] = e.value ?? null;
  }
  return { ...value, lot: out };
}

/** Chuỗi rỗng ("không có" theo toAiOutputSchema) → null, đệ quy. */
export function emptyToNull(value: unknown): unknown {
  if (value === "") return null;
  if (Array.isArray(value)) return value.map(emptyToNull);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, emptyToNull(v)]));
  return value;
}

/** Kết quả AI (theo toAiOutputSchema) → dạng của schema gốc: mảng `lot` → object, "" → null, số gửi dạng chuỗi → số. */
export function fromAiOutput(schema: ZodType, value: unknown): unknown {
  return coerceNumbers(schema, emptyToNull(lotFromAi(schema, value)));
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
