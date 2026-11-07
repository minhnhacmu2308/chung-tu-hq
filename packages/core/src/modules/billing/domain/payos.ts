// Chữ ký PayOS (HMAC-SHA256 bằng checksum key) – hàm thuần, cùng đầu vào luôn ra cùng chữ ký. Khóa do hạ tầng truyền vào, không log.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Chuỗi ký của một object: key sắp theo alphabet, nối `k=v&k2=v2`; null/undefined → chuỗi rỗng; object/mảng → JSON. */
export function payosSignData(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((k) => {
      const v = data[k];
      const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k}=${s}`;
    })
    .join("&");
}

export const hmacSha256Hex = (key: string, text: string) => createHmac("sha256", key).update(text, "utf8").digest("hex");

/** Chữ ký tạo link thanh toán: đúng 5 trường amount, cancelUrl, description, orderCode, returnUrl (theo alphabet). */
export function paymentRequestSignature(checksumKey: string, p: { amount: number; cancelUrl: string; description: string; orderCode: number; returnUrl: string }): string {
  return hmacSha256Hex(checksumKey, `amount=${p.amount}&cancelUrl=${p.cancelUrl}&description=${p.description}&orderCode=${p.orderCode}&returnUrl=${p.returnUrl}`);
}

/** Chữ ký `data` của webhook PayOS. */
export const webhookSignature = (checksumKey: string, data: Record<string, unknown>) => hmacSha256Hex(checksumKey, payosSignData(data));

/** So chữ ký webhook bằng timingSafeEqual (không lộ thời gian so sánh). */
export function verifyWebhookSignature(checksumKey: string, data: Record<string, unknown>, signature: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(webhookSignature(checksumKey, data), "hex");
  const given = Buffer.from(signature.toLowerCase(), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Mô tả chuyển khoản ≤ 25 ký tự (giới hạn của PayOS): `KB<orderCode>`. */
export const payosDescription = (orderCode: number) => `KB${orderCode}`.slice(0, 25);

/** Mã đơn: số nguyên dương duy nhất ≤ 2^53 – (ms % 1e12) × 1000 + số ngẫu nhiên 0..999 (trùng → thử lại với số khác). */
export const newOrderCode = (nowMs: number, rand: number) => Math.max(1, (nowMs % 1e12) * 1000 + (Math.floor(rand) % 1000));
