// Che bí mật/định danh trước khi ghi nhật ký thông điệp (bất biến: không lộ bí mật qua API/log). Thuần.
const SECRET_KEY = /password|access_key|accesskey|secret|token|terminal_access/i;
const TAX_KEY = /mst|tax|_imc$|_epc$|_cgc$|ma_dv/i;
const PHONE_KEY = /phone|_imt$|_ept$|_cgt$|dien_thoai|_stl$/i;

export const maskTaxCode = (v: string) => (v.length >= 8 ? `${v.slice(0, 4)}****${v.slice(-2)}` : "****");
export const maskPhone = (v: string) => (v.length >= 6 ? `${v.slice(0, 3)}***${v.slice(-2)}` : "***");

/** Đi sâu mọi object/mảng; key nhạy cảm → "***"; MST → giữ 4 đầu 2 cuối; điện thoại → 3 đầu 2 cuối. Không đổi dữ liệu gốc. */
export function maskPayload<T>(value: T): T {
  return walk(value, null) as T;
}

function walk(v: unknown, key: string | null): unknown {
  if (Array.isArray(v)) return v.map((x) => walk(x, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, k)]));
  if (typeof v === "string" && key) {
    if (SECRET_KEY.test(key)) return "***";
    if (TAX_KEY.test(key) && /^\d{8,14}(-\d{3})?$/.test(v)) return maskTaxCode(v);
    if (PHONE_KEY.test(key) && /^[\d\s().+-]{6,}$/.test(v)) return maskPhone(v);
  }
  return v;
}
