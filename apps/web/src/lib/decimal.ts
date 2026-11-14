// Tính tiền trong prototype: đổi chuỗi thập phân sang số nguyên đơn vị nhỏ (xu/đồng) rồi mới cộng trừ.
// Khi có backend, phép tính tiền nằm ở server (Decimal) – file này chỉ phục vụ mock.

/** "1477.80" → 147780 (scale 2). */
export function toMinor(value: string, scale = 2): number {
  const [int = "0", frac = ""] = value.trim().split(".");
  const sign = int.startsWith("-") ? -1 : 1;
  const whole = Math.abs(Number(int)) * 10 ** scale;
  const part = Number((frac + "0".repeat(scale)).slice(0, scale) || "0");
  return sign * (whole + part);
}

/** 147780 → "1477.80" (scale 2). */
export function fromMinor(minor: number, scale = 2): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  if (scale === 0) return `${sign}${abs}`;
  const s = String(abs).padStart(scale + 1, "0");
  return `${sign}${s.slice(0, -scale)}.${s.slice(-scale)}`;
}

/** Áp thuế suất phần trăm dạng chuỗi ("8", "2.5") lên số nguyên, làm tròn tới đơn vị. */
export function applyRate(amount: number, ratePercent: string): number {
  const bp = Math.round(Number(ratePercent) * 100); // basis point × 1
  return Math.round((amount * bp) / 10_000);
}

export const sumMinor = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Chuỗi thập phân → BigInt × 10^scale (cắt phần lẻ thừa). Dùng cho phép nhân không tràn số. */
const toScaled = (v: string, scale: number): bigint => {
  const t = v.trim();
  const neg = t.startsWith("-");
  const [int = "0", frac = ""] = t.replace(/^-/, "").split(".");
  const n = BigInt((int || "0") + (frac + "0".repeat(scale)).slice(0, scale));
  return neg ? -n : n;
};

/**
 * a × b làm tròn `scale` số lẻ (half-up), không qua số thực – vd thành tiền dòng = số lượng × đơn giá.
 * Cùng quy tắc với backend (Decimal ROUND_HALF_UP, toDecimalString(·, 2)); số chính thức vẫn do server tính.
 */
export function mulDecimal(a: string, b: string, scale = 2): string {
  const S = 12;
  const prod = toScaled(a, S) * toScaled(b, S); // × 10^(2S)
  const div = 10n ** BigInt(2 * S - scale);
  const abs = prod < 0n ? -prod : prod;
  const q = (abs + div / 2n) / div;
  const s = q.toString().padStart(scale + 1, "0");
  const out = scale ? `${s.slice(0, -scale)}.${s.slice(-scale)}` : s;
  return prod < 0n && q !== 0n ? `-${out}` : out;
}

/** Chuỗi thập phân dạng gọn: bỏ số 0 thừa đầu/cuối ("012.500" → "12.5", "3.000" → "3") – như Decimal.toFixed() của backend. */
export function plainDecimal(v: string): string {
  const t = v.trim();
  const neg = t.startsWith("-");
  const [int = "0", frac = ""] = t.replace(/^-/, "").split(".");
  const i = int.replace(/^0+(?=\d)/, "") || "0";
  const f = frac.replace(/0+$/, "");
  const out = f ? `${i}.${f}` : i;
  return neg && out !== "0" ? `-${out}` : out;
}

/**
 * a ÷ b làm tròn `scale` số lẻ (half-up), không qua số thực, kết quả dạng gọn (plainDecimal) – như Decimal.div().toDecimalPlaces(scale, ROUND_HALF_UP)
 * của backend (vd đổi ĐVT gốc mặt hàng: hệ số ÷ f, 9 số lẻ). b = 0 → ném lỗi.
 */
export function divDecimal(a: string, b: string, scale = 9): string {
  const S = 18;
  const num = toScaled(a, S) * 10n ** BigInt(scale);
  const den = toScaled(b, S);
  if (den === 0n) throw new Error("divDecimal: chia cho 0");
  const neg = num < 0n !== den < 0n && num !== 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = (2n * n + d) / (2n * d);
  const s = q.toString().padStart(scale + 1, "0");
  const out = plainDecimal(scale ? `${s.slice(0, -scale)}.${s.slice(-scale)}` : s);
  return neg && out !== "0" ? `-${out}` : out;
}

/** So sánh hai chuỗi thập phân theo giá trị ("5" = "5.0000"). */
export const sameDecimal = (a: string, b: string) => plainDecimal(a) === plainDecimal(b);

/** Tổng chuỗi thập phân, giữ `scale` số lẻ. */
export function sumDecimal(xs: readonly string[], scale = 2): string {
  const total = xs.reduce((acc, x) => acc + toScaled(x, scale), 0n);
  const abs = total < 0n ? -total : total;
  const s = abs.toString().padStart(scale + 1, "0");
  return `${total < 0n ? "-" : ""}${scale ? `${s.slice(0, -scale)}.${s.slice(-scale)}` : s}`;
}
