// Địa điểm xếp / dỡ hàng theo phương thức vận chuyển (IDA 1.33 / 1.34, EDA 2.28 / 2.29) – MỘT quy tắc cho tra cứu danh mục A016 (web),
// khóa ô + điền sẵn khi PTVC 9, ô còn thiếu / sai dạng (requiredGaps – duyệt, khai) và dựng tờ khai (backend).
//   Nhập khẩu: dỡ hàng = địa điểm Việt Nam (theo PTVC), xếp hàng = nước ngoài. Xuất khẩu: xếp hàng = Việt Nam (theo PTVC), nhận hàng cuối cùng = nước ngoài.
//   PTVC 9 (khác – hàng tại chỗ): không tra danh mục; mã cả hai ô là VNZZZ (không sửa), tên người khai nhập in hoa không dấu, bắt buộc.
//   Tên địa điểm: PTVC 9 hoặc mã chưa mã hóa (mã nước + "ZZZ") → người khai nhập, GỬI cả mã và tên. Còn lại → tên theo danh mục A016 của mã
//   (chỉ đọc, đổi ngay khi đổi mã), CHỈ GỬI MÃ – Hải quan tự xuất tên theo mã (Phụ lục II: "ô 2 tên địa điểm hệ thống tự xuất theo mã").

type Kind = "IDA" | "EDA";
type Values = Record<string, string>;

/** Mã PTVC "Khác" (xuất nhập khẩu tại chỗ…). */
export const ON_SITE_TRANSPORT = "9";
/** Mã địa điểm khai khi PTVC 9. */
export const ON_SITE_PLACE = "VNZZZ";

export type TransportPlace = { no: string; code: string; name: string; domestic: boolean };

export const TRANSPORT_PLACES: Record<Kind, readonly TransportPlace[]> = {
  IDA: [
    { no: "1.33", code: "VD_DST", name: "VD_DSN", domestic: true },
    { no: "1.34", code: "VD_PSC", name: "VD_PSN", domestic: false },
  ],
  EDA: [
    { no: "2.28", code: "TK_DSC", name: "TK_DSN", domestic: false },
    { no: "2.29", code: "TK_PSC", name: "TK_PSN", domestic: true },
  ],
};

/** Ô 1 chỉ tiêu 1.31 / 2.30 (mã phương tiện – hô hiệu tàu). */
export const CALL_SIGN_KEY: Record<Kind, string> = { IDA: "VD_VSC", EDA: "TK_VSC" };
/** Hô hiệu tàu chưa đăng ký trên hệ thống – điền sẵn khi PTVC đường biển / sông. */
export const UNREGISTERED_CALL_SIGN = "9999";
/** PTVC đường biển / sông (2, 3, 6) – giống điều kiện BY_WATER. */
export const isByWater = (v: Values) => ["2", "3", "6"].includes((v["TK_MTC"] ?? "").trim());

export const transportPlaceOf = (kind: Kind, key: string): TransportPlace | undefined => TRANSPORT_PLACES[kind].find((p) => p.code === key || p.name === key);
export const isOnSiteTransport = (v: Values) => (v["TK_MTC"] ?? "").trim() === ON_SITE_TRANSPORT;

/** Phạm vi danh mục A016 của ô mã: trong nước theo PTVC (chưa chọn PTVC → mọi địa điểm trong nước) / nước ngoài; PTVC 9 → không tra. */
export type PlaceScope = { domestic: true; mode: string | null } | { domestic: false } | { onSite: true };
export function transportPlaceScope(kind: Kind, key: string, v: Values): PlaceScope | null {
  const p = TRANSPORT_PLACES[kind].find((x) => x.code === key);
  if (!p) return null;
  if (isOnSiteTransport(v)) return { onSite: true };
  if (!p.domestic) return { domestic: false };
  const mode = (v["TK_MTC"] ?? "").trim();
  return { domestic: true, mode: mode || null };
}

/** Mục danh mục A016 thuộc phạm vi: trong nước = mã cha VN có PTVC áp dụng (đúng PTVC nếu đã chọn); nước ngoài = mã cha khác VN. */
export function inPlaceScope(scope: PlaceScope, e: { parent?: string; modes?: readonly string[] }): boolean {
  if ("onSite" in scope) return false;
  if (!scope.domestic) return Boolean(e.parent) && e.parent !== "VN";
  if (e.parent !== "VN" || !e.modes?.length) return false;
  return !scope.mode || e.modes.includes(scope.mode);
}

/** Bỏ dấu tiếng Việt, in hoa – tên địa điểm khi PTVC 9. */
export const plainUpper = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase();
/** Tên in hoa không dấu: chỉ chữ A–Z, số, khoảng trắng và dấu câu ASCII thường gặp trong địa chỉ. */
const PLAIN_UPPER = /^[A-Z0-9 .,\-/()&'#]+$/;

/** Mã chưa mã hóa: mã nước + "ZZZ" (VNZZZ, CNZZZ…) – không có tên trong danh mục, phải khai tên. */
const uncoded = (code: string) => /^[A-Z]{2}ZZZ$/.test(code.trim().toUpperCase());

/** Tên địa điểm do người khai nhập và gửi Hải quan: PTVC 9 hoặc mã chưa mã hóa. Dùng chung cho form, kiểm tra thiếu và dựng bản gửi FPT. */
export function sendsPlaceName(transport: string, code: string): boolean {
  return transport.trim() === ON_SITE_TRANSPORT || uncoded(code);
}

/** Ô tên địa điểm xếp / dỡ (1.33 / 1.34, 2.28 / 2.29) mà tên theo mã (chỉ đọc, không gửi) → mã nguồn để tra A016; ô khác / tên nhập tay → null. */
export function placeNameSource(kind: Kind, key: string, v: Values): string | null {
  const p = TRANSPORT_PLACES[kind].find((x) => x.name === key);
  return p && !sendsPlaceName(v["TK_MTC"] ?? "", v[p.code] ?? "") ? p.code : null;
}

/** Ô mã bị khóa vì PTVC 9 → giá trị cố định VNZZZ. */
export function fixedPlaceCode(kind: Kind, key: string, v: Values): string | null {
  return isOnSiteTransport(v) && TRANSPORT_PLACES[kind].some((p) => p.code === key) ? ON_SITE_PLACE : null;
}

/**
 * Áp quy tắc sau khi đổi một ô (form, panel sửa ô): đổi PTVC sang 9 → mã xếp / dỡ = VNZZZ và tên đang có → in hoa không dấu; rời PTVC 9 → bỏ VNZZZ
 * (chọn lại theo danh mục); ô 1 chỉ tiêu 1.31 / 2.30: PTVC 2, 3, 6 → 9999, mã khác → trống. Đổi mã (hoặc PTVC) mà tên theo mã → tên = tên danh mục của mã mới (`placeName`, tra A016; không có → trống);
 * mã chuyển sang chưa mã hóa (…ZZZ) → bỏ tên tự điền để người khai nhập. Tên gõ tay do ô nhập tự chuyển in hoa không dấu (giữ con trỏ) – không chuyển ở đây.
 */
export function transportPlaceChanges(kind: Kind, before: Values, key: string, value: string, placeName?: (code: string) => string | undefined): Values {
  const after = { ...before, [key]: value };
  const out: Values = { [key]: value };
  if (key === "TK_MTC") {
    const was = isOnSiteTransport(before), now = isOnSiteTransport(after);
    for (const p of TRANSPORT_PLACES[kind]) {
      if (now && (after[p.code] ?? "") !== ON_SITE_PLACE) out[p.code] = ON_SITE_PLACE;
      if (was && !now && (after[p.code] ?? "").trim() === ON_SITE_PLACE) out[p.code] = "";
    }
    if (now) for (const p of TRANSPORT_PLACES[kind]) if (after[p.name]?.trim() && plainUpper(after[p.name]!) !== after[p.name]) out[p.name] = plainUpper(after[p.name]!);
    // 1.31 / 2.30 ô 1: sang PTVC 2, 3, 6 → 9999 (đổi giữa 2, 3, 6 thì giữ hô hiệu đang có); sang mã khác → trống để người khai nhập.
    const sign = CALL_SIGN_KEY[kind], current = (after[sign] ?? "").trim();
    const wasWater = isByWater(before), water = isByWater(after);
    if (water && (!wasWater || !current)) out[sign] = UNREGISTERED_CALL_SIGN;
    if (!water && wasWater && current) out[sign] = "";
  }
  const v = { ...after, ...out };
  for (const p of TRANSPORT_PLACES[kind]) {
    if (key !== "TK_MTC" && key !== p.code) continue;
    const code = (v[p.code] ?? "").trim();
    const name = v[p.name] ?? "";
    const autoBefore = !sendsPlaceName(before["TK_MTC"] ?? "", before[p.code] ?? "");
    let next = name;
    if (!sendsPlaceName(v["TK_MTC"] ?? "", code)) next = code ? placeName?.(code) ?? "" : "";
    else if (key === p.code && autoBefore) next = "";
    if (next !== name) out[p.name] = next;
  }
  return out;
}

export type PlaceIssue = { key: string; no: string; reason: "NAME_REQUIRED" | "NAME_FORMAT" | "CODE_FIXED" };
/**
 * Tên nhập tay (PTVC 9, mã …ZZZ): bắt buộc, in hoa không dấu. PTVC 9: mã phải là VNZZZ.
 * Tên theo mã → không có lỗi riêng (vai trò ô mã theo Phụ lục II).
 */
export function transportPlaceIssues(kind: Kind, v: Values): PlaceIssue[] {
  const onSite = isOnSiteTransport(v);
  return TRANSPORT_PLACES[kind].flatMap((p): PlaceIssue[] => {
    const code = (v[p.code] ?? "").trim();
    if (!sendsPlaceName(v["TK_MTC"] ?? "", code)) return [];
    const name = (v[p.name] ?? "").trim();
    const out: PlaceIssue[] = [];
    if (onSite && code !== ON_SITE_PLACE) out.push({ key: p.code, no: p.no, reason: "CODE_FIXED" });
    if (!name) out.push({ key: p.name, no: p.no, reason: "NAME_REQUIRED" });
    else if (!PLAIN_UPPER.test(name)) out.push({ key: p.name, no: p.no, reason: "NAME_FORMAT" });
    return out;
  });
}
