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
