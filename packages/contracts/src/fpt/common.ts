import { z } from "zod";

/**
 * Hợp đồng dữ liệu cho API FPT.VNACCS (cổng truyền tờ khai Hải quan).
 *
 * Nguồn: `business/13-API-FPT-dac-ta/*.xlsx` (đặc tả FPT) + `business/format.json` (payload mẫu).
 *
 * QUY ƯỚC KEY JSON (xác nhận từ format.json):
 * Đặc tả đặt tên trường kiểu `TK_ICB`, `HAG_CMD`, `CON_C01`, `CTHQ_D01`, nhưng payload JSON của FPT
 * dùng tên đã qua bộ camelCase của .NET (Newtonsoft/System.Text.Json): hạ chữ thường cụm chữ HOA đầu
 * tên, TRỪ ký tự hoa cuối cùng đứng ngay trước một ký tự không phải chữ hoa (`_`, chữ số, chữ thường).
 * Ví dụ đúng như format.json: `TK_ICB → tK_ICB`, `HAG_CMD → haG_CMD` (KHÔNG phải `hAG_CMD`),
 * `CON_C01 → coN_C01`, `CTHQ_D01 → cthQ_D01`. Xem `fptKey`.
 * Tên object bọc ngoài (`objVN_EDA`, `objVN_EDA_HANG`…) giữ nguyên như format.json.
 * Ngoại lệ: API V5 bổ sung chứng từ (sheet `HỎI KQ V5 Đính kèm CTBS`) – mẫu đầu format.json dùng
 * key HOA nguyên gốc (`TK_SOTK`, `MA_DV`), không qua camelCase.
 *
 * KIỂU DỮ LIỆU (cột Type của sheet):
 * - Text / TEXT / Memo → `text` (`z.string().max(size)`; Memo không giới hạn). Độ dài tính theo ký tự JS;
 *   VNACCS có thể đếm theo byte – cần đối chiếu T1 với dữ liệu có dấu.
 * - Decimal → `decimal`, số JSON (`"tK_GW": 600`). Size "18.4" = (size 18, scale 4), scale chỉ là metadata,
 *   không kiểm tra ở đây; lớp ánh xạ tự làm tròn từ `Decimal` trước khi serialize.
 * - Double (chỉ TK_IP4, HAG_BPR, TK_LOAIHINHTK) → `decimal` vì mẫu gửi số (`"tK_IP4": 5543.17`); có `note`.
 * - Long Integer → `long` (`z.number().int()`).
 * - Date/Time, Datetime (size 8) → `date`, chuỗi `dd/MM/yyyy` (mẫu: `"tK_ECD": "08/01/2025"`).
 * - `datetime` để dành cho trường thời điểm nếu FPT trả về; hiện không trường nào dùng.
 * Trường không bắt buộc nhận cả `null`, `""` và thiếu key – format.json dùng cả ba.
 */

export type FptFieldType = "text" | "decimal" | "date" | "datetime" | "long";

/** Độ nới khi payload mẫu gửi số dưới dạng chuỗi (`"tK_NO": "23"`). */
export type FptAcceptString = "numeric" | "any";

export interface FptFieldMeta {
  /** Tên trường đúng như đặc tả, ví dụ `TK_ICB`. Key JSON: `fptKey(name)`. */
  name: string;
  type: FptFieldType;
  size?: number;
  scale?: number;
  /** Cột Required = "X" trong sheet. */
  required: boolean;
  /** Mô tả tiếng Việt trong sheet. */
  label: string;
  /** Ghi chú khi kiểu trong sheet lạ hoặc mẫu lệch đặc tả. */
  note?: string;
  /** Cột Category/bảng mã (tên file bảng mã hoặc mã ngắn). */
  category?: string;
  /** Số nhưng chấp nhận thêm chuỗi – chỉ đặt khi format.json chứng minh. */
  acceptString?: FptAcceptString;
}

export interface FptFieldExtra {
  readonly note?: string;
  readonly category?: string;
  readonly acceptString?: FptAcceptString;
}

/** Một dòng sheet ở dạng gọn: [Name, type, Size gốc ("18.4"|"35"|null), Required, Description VI, extra?]. */
export type FptFieldRow =
  | readonly [name: string, type: FptFieldType, size: string | null, required: boolean, label: string]
  | readonly [name: string, type: FptFieldType, size: string | null, required: boolean, label: string, extra: FptFieldExtra];

// ---------------------------------------------------------------- fptKey

type IsUpper<C extends string> = C extends Uppercase<C> ? (C extends Lowercase<C> ? false : true) : false;
type CamelTail<S extends string> = S extends `${infer C}${infer Rest}`
  ? Rest extends `${infer N}${string}`
    ? IsUpper<N> extends true
      ? `${Lowercase<C>}${CamelTail<Rest>}`
      : S
    : Lowercase<C>
  : S;

/** `fptKey` ở mức kiểu: `FptKey<"HAG_CMD">` = `"haG_CMD"`. */
export type FptKey<S extends string> = S extends `${infer C0}${infer R}`
  ? R extends `${infer C1}${string}`
    ? IsUpper<C1> extends true
      ? `${Lowercase<C0>}${CamelTail<R>}`
      : `${Lowercase<C0>}${R}`
    : Lowercase<C0>
  : S;

const isUpper = (c: string): boolean => c !== c.toLowerCase() && c === c.toUpperCase();

/**
 * Tên trường đặc tả → key JSON FPT. Cài đặt đúng thuật toán camelCase của .NET:
 * `TK_ICB → tK_ICB`, `HAG_CMD → haG_CMD`, `CTHQ_D01 → cthQ_D01`, `MALHV4 → malhV4`.
 */
export function fptKey<S extends string>(name: S): FptKey<S> {
  const chars = [...name];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    if (i === 1 && !isUpper(c)) break;
    const next = chars[i + 1];
    if (i > 0 && next !== undefined && !isUpper(next)) break;
    chars[i] = c.toLowerCase();
  }
  return chars.join("") as FptKey<S>;
}

// ---------------------------------------------------------------- meta → Zod

export const FPT_DATE_RE = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
const NUMERIC_STRING_RE = /^-?\d+(\.\d+)?$/;

/** Chuyển dòng sheet gọn thành `FptFieldMeta` (tách Size "18.4" → size 18, scale 4). */
export function toFptFields(rows: readonly FptFieldRow[]): FptFieldMeta[] {
  return rows.map((row) => {
    const [name, type, rawSize, required, label] = row;
    const extra: FptFieldExtra = row.length === 6 ? row[5] : {};
    const meta: FptFieldMeta = { name, type, required, label };
    if (rawSize !== null) {
      const [intPart, scalePart] = rawSize.split(".");
      meta.size = Number(intPart);
      if (scalePart !== undefined) meta.scale = Number(scalePart);
    }
    if (extra.note !== undefined) meta.note = extra.note;
    if (extra.category !== undefined) meta.category = extra.category;
    if (extra.acceptString !== undefined) meta.acceptString = extra.acceptString;
    return meta;
  });
}

/**
 * - `request`: dữ liệu ta gửi đi – kiểm tra Required, độ dài, định dạng ngày; bỏ key lạ.
 * - `response`: dữ liệu FPT trả về – mọi trường tùy chọn, không giới hạn độ dài, ngày chỉ là chuỗi,
 *   giữ key lạ (đặc tả phần phản hồi chưa đủ chắc chắn – cần đối chiếu T1).
 */
export type FptSchemaMode = "request" | "response";

export function fptFieldSchema(meta: FptFieldMeta, mode: FptSchemaMode = "request"): z.ZodType {
  const strict = mode === "request";
  let base: z.ZodType;
  switch (meta.type) {
    case "text": {
      const s = z.string();
      const sized = strict && meta.size !== undefined ? s.max(meta.size) : s;
      base = strict && meta.required ? sized.min(1) : sized;
      break;
    }
    case "date":
      base = strict ? z.string().regex(FPT_DATE_RE, "Ngày phải dạng dd/MM/yyyy") : z.string();
      break;
    case "datetime":
      base = z.string();
      break;
    case "decimal":
    case "long": {
      const num = meta.type === "long" ? z.number().int() : z.number();
      if (meta.acceptString === "any") base = z.union([num, z.string()]);
      else if (meta.acceptString === "numeric") base = z.union([num, z.string().regex(NUMERIC_STRING_RE)]);
      else base = num;
      break;
    }
  }
  if (strict && meta.required) return base;
  return z.union([base, z.literal("")]).nullish();
}

type RowValue<R extends FptFieldRow> =
  R extends readonly [string, FptFieldType, string | null, boolean, string, infer E]
    ? E extends { readonly acceptString: FptAcceptString }
      ? number | string
      : BaseValue<R[1]>
    : BaseValue<R[1]>;
type BaseValue<T extends FptFieldType> = T extends "decimal" | "long" ? number : string;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Kiểu object JSON FPT sinh từ mảng dòng sheet (key đã qua `fptKey`). */
export type FptRecord<Rows extends readonly FptFieldRow[]> = Simplify<
  { [R in Rows[number] as R[3] extends true ? FptKey<R[0]> : never]: RowValue<R> } & {
    [R in Rows[number] as R[3] extends true ? never : FptKey<R[0]>]?: RowValue<R> | "" | null | undefined;
  }
>;

/** Kiểu phản hồi: mọi trường tùy chọn. */
export type FptResponseRecord<Rows extends readonly FptFieldRow[]> = Simplify<{
  [R in Rows[number] as FptKey<R[0]>]?: RowValue<R> | "" | null | undefined;
}>;

export function fptObjectSchema<const Rows extends readonly FptFieldRow[]>(
  rows: Rows,
  mode: "response",
): z.ZodType<FptResponseRecord<Rows>>;
export function fptObjectSchema<const Rows extends readonly FptFieldRow[]>(
  rows: Rows,
  mode?: "request",
): z.ZodType<FptRecord<Rows>>;
export function fptObjectSchema(rows: readonly FptFieldRow[], mode: FptSchemaMode = "request"): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const meta of toFptFields(rows)) shape[fptKey(meta.name)] = fptFieldSchema(meta, mode);
  return mode === "request" ? z.object(shape) : z.looseObject(shape);
}

// ---------------------------------------------------------------- tài khoản VNACCS

/**
 * Tài khoản VNACCS – có trong sheet `HYS`, `EDA01`, `EDC`, `EDD`, `EDE` (Text 50, bắt buộc).
 * Đặc tả không nói đặt ở đâu trong payload IDA/EDA (format.json không có) – cần đối chiếu T1.
 * Key theo `fptKey` (USER_ID → useR_ID) là SUY LUẬN từ quy ước camelCase, chưa có mẫu xác nhận.
 */
export const FPT_CREDENTIAL_ROWS = [
  ["USER_ID", "text", "50", true, "Tài khoản vnaccs"],
  ["PASSWORD", "text", "50", true, "Tài khoản vnaccs"],
  ["TERMINAL_ID", "text", "50", true, "Tài khoản vnaccs"],
  ["TERMINAL_ACCESS_KEY", "text", "50", true, "Tài khoản vnaccs"],
] as const satisfies readonly FptFieldRow[];
export const FptVnaccsCredentialsSchema = fptObjectSchema(FPT_CREDENTIAL_ROWS);
export type FptVnaccsCredentials = z.infer<typeof FptVnaccsCredentialsSchema>;

// ---------------------------------------------------------------- lỗi & phản hồi chung

/**
 * Một lỗi trong `errorList` – sheet `errorList` (BO SUNG CHUNG TU v1.4). Tên key đã là camelCase
 * trong đặc tả. Kích thước theo đặc tả (không ép khi parse phản hồi): errorCode Text(12),
 * indexCode Text(50), nameCode Text(200), errorContent Text(max), proposedSolution Text(max),
 * rowPosition Text(12).
 */
export const FptErrorItemSchema = z.looseObject({
  /** Mã lỗi. */
  errorCode: z.string().nullish(),
  /** Mã chỉ tiêu lỗi (ví dụ TK_ICB). */
  indexCode: z.string().nullish(),
  /** Tên chỉ tiêu lỗi. */
  nameCode: z.string().nullish(),
  /** Nội dung chi tiết lỗi. */
  errorContent: z.string().nullish(),
  /** Hướng dẫn cách khắc phục. */
  proposedSolution: z.string().nullish(),
  /** Vị trí dòng hàng lỗi nếu có. */
  rowPosition: z.string().nullish(),
});
export type FptErrorItem = z.infer<typeof FptErrorItemSchema>;

/**
 * Vỏ phản hồi tối thiểu. Đặc tả KHÔNG mô tả vỏ chung kiểu `{ status, message, data }`; chỉ có
 * `errorList` (List, "Lỗi xử lý từ API") là một chỉ tiêu Response trong sheet
 * `HỎI KQ V5 Đính kèm CTBS`. Các key khác được giữ nguyên (looseObject). CẦN ĐỐI CHIẾU T1.
 */
export const FptResponseEnvelopeSchema = z.looseObject({
  errorList: z.array(FptErrorItemSchema).nullish(),
});
export type FptResponseEnvelope = z.infer<typeof FptResponseEnvelopeSchema>;
