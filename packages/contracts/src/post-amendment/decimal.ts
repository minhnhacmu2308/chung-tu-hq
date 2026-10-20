// Số thập phân chính xác dạng chuỗi cho phần tính lại thuế của bản khai bổ sung (dùng chung FE/BE, không dùng `number`).
// Nhận "78721520.22" hoặc "78,721,520.22" (dấu phẩy ngăn nghìn); trả chuỗi "1234.5678".

type Dec = { n: bigint; scale: number };

const DEC_RE = /^-?\d+(\.\d+)?$/;

/** null khi không phải số. */
export function parseDec(s: string | undefined | null): Dec | null {
  const t = (s ?? "").trim().replace(/,/g, "");
  if (!DEC_RE.test(t)) return null;
  const [i = "0", f = ""] = t.replace("-", "").split(".");
  const n = BigInt(i + f);
  return { n: t.startsWith("-") ? -n : n, scale: f.length };
}

const pow = (k: number) => 10n ** BigInt(k);
const align = (a: Dec, scale: number) => a.n * pow(scale - a.scale);

export function addDec(a: Dec, b: Dec): Dec {
  const scale = Math.max(a.scale, b.scale);
  return { n: align(a, scale) + align(b, scale), scale };
}
export const subDec = (a: Dec, b: Dec): Dec => addDec(a, { n: -b.n, scale: b.scale });
export const mulDec = (a: Dec, b: Dec): Dec => ({ n: a.n * b.n, scale: a.scale + b.scale });
/** Chia cho 100 (thuế suất %). */
export const percentOf = (a: Dec, rate: Dec): Dec => ({ n: a.n * rate.n, scale: a.scale + rate.scale + 2 });

/** Làm tròn nửa lên (HALF_UP, theo trị tuyệt đối) về `scale` chữ số thập phân. */
export function roundDec(a: Dec, scale: number): Dec {
  if (a.scale <= scale) return a;
  const d = pow(a.scale - scale);
  const abs = a.n < 0n ? -a.n : a.n;
  const q = (abs + d / 2n) / d;
  return { n: a.n < 0n ? -q : q, scale };
}

/** `fixed`: luôn đủ số chữ số thập phân (tiền thuế "3936076.0110"); mặc định bỏ số 0 thừa ở cuối. */
export function formatDec(a: Dec, opts: { scale?: number; fixed?: boolean } = {}): string {
  const r = opts.scale === undefined ? a : roundDec(a, opts.scale);
  const scale = opts.fixed && opts.scale !== undefined ? opts.scale : r.scale;
  const n = r.n * pow(scale - r.scale);
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(scale + 1, "0");
  let int = digits.slice(0, digits.length - scale);
  let frac = scale ? digits.slice(digits.length - scale) : "";
  if (!opts.fixed) frac = frac.replace(/0+$/, "");
  int = int.replace(/^0+(?=\d)/, "");
  const body = frac ? `${int}.${frac}` : int;
  return neg && /[1-9]/.test(body) ? `-${body}` : body;
}

export const ZERO: Dec = { n: 0n, scale: 0 };
export type { Dec };
