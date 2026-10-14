import type { DecimalString } from "@kb/contracts";
import { DecimalStringSchema } from "@kb/contracts";
import { Decimal as DecimalJs } from "decimal.js";

/** decimal.js cấu hình cho tiền/trị giá: 40 chữ số, làm tròn ROUND_HALF_UP. */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

/** Chuỗi phải đúng dạng DecimalString; number chỉ dùng cho hằng số nhỏ (tỷ lệ, số lượng). */
export function dec(v: DecimalString | number): Decimal {
  if (typeof v === "number") return new Decimal(v);
  return new Decimal(DecimalStringSchema.parse(v));
}

export function toDecimalString(d: Decimal, scale?: number): DecimalString {
  return scale === undefined ? d.toFixed() : d.toFixed(scale);
}

export function sumDec(list: Iterable<DecimalString | Decimal>): Decimal {
  let s = new Decimal(0);
  for (const x of list) s = s.plus(x instanceof Decimal ? x : dec(x));
  return s;
}
