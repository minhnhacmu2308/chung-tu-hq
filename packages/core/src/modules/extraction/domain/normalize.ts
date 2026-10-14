// Chuẩn hóa giá trị model đọc ra: số theo locale, ngày, nước, đơn vị, tên công ty. Hàm thuần, không I/O.
import type { DecimalString, IsoDate } from "@kb/contracts";

/** "1,234.56" | "1.234,56" | "1 234,5" | "USD 1,150.00" | 3860.5 → chuỗi thập phân dấu chấm; không phải số → null. */
export function parseNumber(raw: string | number | null | undefined): DecimalString | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : null;
  let s = raw.replace(/[^\d.,\-\s]/g, "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const neg = s.startsWith("-");
  s = s.replace(/^-/, "").replace(/ /g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let intPart = s;
  let frac = "";
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    intPart = s.slice(0, dec).replace(/[.,]/g, "");
    frac = s.slice(dec + 1);
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    const commas = (s.match(/,/g) ?? []).length;
    // Một dấu phẩy + đúng 3 số sau → phân cách nghìn ("1,234"); còn lại là thập phân ("12,5").
    if (commas === 1 && after === 3) intPart = s.replace(",", "");
    else if (commas > 1) intPart = s.replace(/,/g, "");
    else {
      intPart = s.slice(0, lastComma);
      frac = s.slice(lastComma + 1);
    }
  } else if (lastDot >= 0) {
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1) intPart = s.replace(/\./g, "");
    else {
      intPart = s.slice(0, lastDot);
      frac = s.slice(lastDot + 1);
    }
  }
  if (!/^\d+$/.test(intPart || "0") || (frac && !/^\d+$/.test(frac))) return null;
  const out = `${neg ? "-" : ""}${intPart || "0"}${frac ? `.${frac}` : ""}`;
  return /^-?\d+(\.\d+)?$/.test(out) ? out : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const valid = (y: number, m: number, d: number): IsoDate | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** Nhiều định dạng ngày → YYYY-MM-DD; mặc định ngày/tháng/năm (chứng từ châu Á/EU), `hint` MDY cho chứng từ Mỹ. */
export function parseDate(raw: string | null | undefined, hint: "DMY" | "MDY" = "DMY"): IsoDate | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return hint === "MDY" ? valid(+m[3]!, +m[1]!, +m[2]!) : valid(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i.exec(s);
  if (m && MONTHS[m[2]!.toLowerCase().slice(0, 4)] !== undefined) return valid(+m[3]!, MONTHS[m[2]!.toLowerCase().slice(0, 4)] ?? MONTHS[m[2]!.toLowerCase().slice(0, 3)]!, +m[1]!);
  m = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (m) {
    const mon = MONTHS[m[1]!.toLowerCase().slice(0, 4)] ?? MONTHS[m[1]!.toLowerCase().slice(0, 3)];
    if (mon) return valid(+m[3]!, mon, +m[2]!);
  }
  m = /^(?:ngày\s*)?(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})$/i.exec(s);
  if (m) return valid(+m[3]!, +m[2]!, +m[1]!);
  return null;
}

const COUNTRIES: [RegExp, string][] = [
  [/^(south\s*korea|korea|republic\s*of\s*korea|korea,?\s*republic\s*of|r\.?o\.?k\.?|han\s*quoc|hàn\s*quốc)$/i, "KR"],
  [/^(china|p\.?r\.?\s*china|people'?s\s*republic\s*of\s*china|prc|trung\s*quoc|trung\s*quốc)$/i, "CN"],
  [/^(viet\s*nam|vietnam|việt\s*nam|s\.?r\.?\s*vietnam|socialist\s*republic\s*of\s*vietnam)$/i, "VN"],
  [/^(italy|italia)$/i, "IT"], [/^japan$/i, "JP"], [/^(germany|deutschland)$/i, "DE"], [/^(usa|u\.s\.a\.?|united\s*states(\s*of\s*america)?|us)$/i, "US"],
  [/^thailand$/i, "TH"], [/^(taiwan|taiwan,?\s*r\.?o\.?c\.?|chinese\s*taipei)$/i, "TW"], [/^(hong\s*kong|hongkong)$/i, "HK"], [/^singapore$/i, "SG"],
  [/^malaysia$/i, "MY"], [/^indonesia$/i, "ID"], [/^india$/i, "IN"], [/^france$/i, "FR"], [/^(uk|united\s*kingdom|great\s*britain|england)$/i, "GB"],
  [/^spain$/i, "ES"], [/^netherlands$/i, "NL"], [/^belgium$/i, "BE"], [/^switzerland$/i, "CH"], [/^australia$/i, "AU"], [/^canada$/i, "CA"],
  [/^(turkey|türkiye)$/i, "TR"], [/^(uae|united\s*arab\s*emirates)$/i, "AE"], [/^philippines$/i, "PH"], [/^cambodia$/i, "KH"], [/^laos?$/i, "LA"],
];

/** Tên nước → ISO 3166-1 alpha-2; mã 2 chữ giữ nguyên (viết hoa). */
export function countryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  for (const [re, code] of COUNTRIES) if (re.test(s)) return code;
  return null;
}

const UNITS: [RegExp, string][] = [
  [/^(pcs?|pce|pieces?|ea|each|units?|chiếc|cái|c)$/i, "PCE"], [/^(sets?|bộ)$/i, "SET"], [/^(kgs?|kgm|kilograms?)$/i, "KGM"], [/^(ctns?|cartons?|thùng)$/i, "CTN"],
  [/^(pkgs?|pk|packages?|kiện)$/i, "PK"], [/^(m|mtr|meters?|metres?|mét)$/i, "MTR"], [/^(l|ltr|liters?|litres?|lít)$/i, "LTR"], [/^(prs?|pairs?|đôi)$/i, "PR"],
  [/^(rolls?|rol|cuộn)$/i, "ROL"], [/^(boxe?s?|hộp)$/i, "BOX"], [/^(bags?|túi)$/i, "BAG"], [/^(drums?|drm)$/i, "DRM"], [/^(tons?|tonnes?|tne|tấn)$/i, "TNE"],
  [/^(g|gr|grams?|grm)$/i, "GRM"], [/^(m2|sqm|mtk)$/i, "MTK"], [/^(m3|cbm|mtq)$/i, "MTQ"], [/^(pallets?|plt)$/i, "PX"], [/^(cases?)$/i, "CS"], [/^(dozens?|dz)$/i, "DZN"],
];

/** Đơn vị tính nguyên văn → mã VNACCS (DVT). */
export function unitCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  for (const [re, code] of UNITS) if (re.test(s)) return code;
  return null;
}

const LEGAL = /\b(co|ltd|limited|company|corp|corporation|inc|incorporated|jsc|llc|gmbh|plc|pte|pty|sa|srl|spa|bv|ag|kk|cong ty|tnhh|co phan|cp|mtv|tm|dv|xnk)\b/g;

/** Bỏ dấu tiếng Việt, hậu tố pháp lý, dấu câu; viết hoa; gộp khoảng trắng. */
export function normalizeCompanyName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Jaccard theo từ sau chuẩn hóa: 1 = giống hệt. */
export function nameSimilarity(a: string, b: string): number {
  const A = new Set(normalizeCompanyName(a).split(" ").filter(Boolean));
  const B = new Set(normalizeCompanyName(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const PACKAGE_TYPES: [RegExp, string][] = [
  [/^(pkgs?|pk|packages?|kiện|package)$/i, "PK"], [/^(ctns?|ct|cartons?|thùng carton|thùng)$/i, "CT"], [/^(plts?|pl|pallets?|pa-lét)$/i, "PL"], [/^(boxe?s?|bx|hộp)$/i, "BX"],
  [/^(bags?|bg|bao|túi)$/i, "BG"], [/^(cases?|cs)$/i, "CS"], [/^(drums?|dr|phuy)$/i, "DR"], [/^(rolls?|ro|cuộn)$/i, "RO"], [/^(pcs?|pieces?|pc|chiếc)$/i, "PC"],
  [/^(crates?|cr)$/i, "CR"], [/^(bundles?|bd|bó)$/i, "BD"], [/^(bales?|bl|kiện bông)$/i, "BL"], [/^(sacks?|sa)$/i, "SA"], [/^(cans?|ca)$/i, "CA"], [/^(units?|un)$/i, "UN"],
];

/** Loại kiện (số kiện trên vận đơn/packing list) → mã VNACCS "Loại kiện" (xem BACKEND-TODO D3 – danh mục đầy đủ chưa có). */
export function packageUnitCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  for (const [re, code] of PACKAGE_TYPES) if (re.test(s)) return code;
  return null;
}

export const normalizeTaxCode = (raw: string | null | undefined) => (raw ? raw.replace(/\D/g, "") : null);
export const isValidTaxCode = (t: string) => /^\d{10}(\d{3})?$/.test(t);
