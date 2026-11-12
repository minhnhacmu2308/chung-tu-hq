// Số tiền bằng chữ tiếng Anh cho Commercial Invoice ("SAY: US DOLLARS … ONLY"). Xử lý trên chuỗi (bất biến 3 – không number).
// kb-allow-raw: chữ trong file này là nội dung chứng từ in tiếng Anh theo thông lệ L/C, không phải chữ giao diện.

const ONES = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
const SCALES = ["", "THOUSAND", "MILLION", "BILLION", "TRILLION", "QUADRILLION"];

/** Tên đơn vị chính / đơn vị lẻ (null = tiền không có đơn vị lẻ). */
const CURRENCY_NAMES: Record<string, [string, string | null]> = {
  USD: ["US DOLLARS", "CENTS"], EUR: ["EUROS", "CENTS"], GBP: ["POUNDS STERLING", "PENCE"], JPY: ["JAPANESE YEN", null],
  CNY: ["CHINESE YUAN", "FEN"], KRW: ["KOREAN WON", null], AUD: ["AUSTRALIAN DOLLARS", "CENTS"], SGD: ["SINGAPORE DOLLARS", "CENTS"],
  HKD: ["HONG KONG DOLLARS", "CENTS"], CAD: ["CANADIAN DOLLARS", "CENTS"], CHF: ["SWISS FRANCS", "CENTIMES"], THB: ["THAI BAHT", "SATANG"],
  VND: ["VIETNAMESE DONG", null],
};

function below1000(n: number): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) out.push(ONES[h]!, "HUNDRED");
  if (r >= 20) {
    out.push(TENS[Math.floor(r / 10)]!);
    if (r % 10) out.push(ONES[r % 10]!);
  } else if (r) out.push(ONES[r]!);
  return out;
}

/** Phần nguyên dạng chuỗi chữ số → chữ (nhóm 3 chữ số, không chuyển sang number cả số). */
function integerWords(digits: string): string {
  const d = digits.replace(/^0+/, "");
  if (!d) return ONES[0]!;
  const groups: number[] = [];
  for (let end = d.length; end > 0; end -= 3) groups.unshift(Number(d.slice(Math.max(0, end - 3), end)));
  if (groups.length > SCALES.length) throw new Error("Số tiền quá lớn");
  const words: string[] = [];
  groups.forEach((g, i) => {
    if (!g) return;
    words.push(...below1000(g));
    const scale = SCALES[groups.length - 1 - i];
    if (scale) words.push(scale);
  });
  return words.join(" ");
}

/**
 * `amount` dạng "1234.5" (≥ 0, tối đa 2 số lẻ). Vd ("1250.50","USD") → "SAY: US DOLLARS ONE THOUSAND TWO HUNDRED FIFTY AND CENTS FIFTY ONLY".
 * Loại tiền không có trong bảng → dùng mã tiền làm tên, đơn vị lẻ "CENTS".
 */
export function amountInWords(amount: string, currency: string): string {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error(`Số tiền không hợp lệ: ${amount}`);
  const code = currency.trim().toUpperCase();
  const [major, minor] = CURRENCY_NAMES[code] ?? [code, "CENTS"];
  const fraction = Number((m[2] ?? "").padEnd(2, "0") || "0");
  let text = `${major} ${integerWords(m[1]!)}`;
  if (fraction) {
    // Tiền không có đơn vị lẻ (JPY, KRW, VND) mà tổng vẫn có lẻ (thành tiền làm tròn 2 số) → ghi kiểu séc "AND 04/100", không làm hỏng bản in.
    text += minor ? ` AND ${minor} ${integerWords(String(fraction))}` : ` AND ${String(fraction).padStart(2, "0")}/100`;
  }
  return `SAY: ${text} ONLY`;
}
