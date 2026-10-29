// Tỷ giá tính thuế (thuần): tuần áp dụng theo giờ VN + đọc bảng XML công khai của Vietcombank.
// Quy định: tỷ giá mua chuyển khoản Hội sở chính Vietcombank cuối ngày thứ Năm tuần trước, áp cho cả tuần (NĐ 08/2015 Đ21 k5, sửa bởi NĐ 167/2025).

import { addIsoDays, sameRateWeek, vnDateOf, weekStart } from "@kb/contracts";

export { sameRateWeek, vnDateOf, weekStart };
const VN_OFFSET_MS = 7 * 3_600_000;

/** Thứ Hai của tuần kế tiếp so với thời điểm `now` (giờ VN) – ngày hiệu lực của tỷ giá chụp tối thứ Năm. */
export const nextMonday = (now: Date) => addIsoDays(weekStart(vnDateOf(now)), 7);

export class VcbParseError extends Error {
  constructor(message: string) {
    super(`Bảng tỷ giá Vietcombank không đọc được: ${message}`);
    this.name = "VcbParseError";
  }
}

export type VcbBoard = { boardAt: Date; rates: { currency: string; transfer: string }[] };

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]?.trim();

/** XML `pXML.aspx`: <DateTime>M/D/YYYY h:mm:ss AM</DateTime> (giờ VN) + <Exrate CurrencyCode Transfer …/>. Lấy cột Transfer (mua chuyển khoản). */
export function parseVcbXml(xml: string): VcbBoard {
  if (!/<ExrateList>/.test(xml)) throw new VcbParseError("không phải ExrateList");
  const dt = /<DateTime>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)\s*<\/DateTime>/i.exec(xml);
  if (!dt) throw new VcbParseError("thiếu DateTime");
  const [, mo, d, y, h, mi, s, ap] = dt;
  const hour = (Number(h) % 12) + (ap!.toUpperCase() === "PM" ? 12 : 0);
  const boardAt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, Number(mi), Number(s)) - VN_OFFSET_MS);
  const rates: VcbBoard["rates"] = [];
  for (const m of xml.matchAll(/<Exrate\b[^>]*\/?>/g)) {
    const currency = attr(m[0], "CurrencyCode");
    const raw = attr(m[0], "Transfer");
    if (!currency || raw === undefined || raw === "-" || raw === "") continue;
    const transfer = raw.replace(/,/g, "");
    if (!/^[A-Z]{3}$/.test(currency) || !/^\d+(\.\d+)?$/.test(transfer) || Number(transfer) <= 0) throw new VcbParseError(`dòng ${currency ?? "?"} sai định dạng (${raw})`);
    rates.push({ currency, transfer });
  }
  if (!rates.some((r) => r.currency === "USD")) throw new VcbParseError("thiếu USD");
  return { boardAt, rates };
}

/**
 * JSON tỷ giá theo ngày của Vietcombank (`/api/exchangerates?date=YYYY-MM-DD`): {"UpdatedDate":"2026-10-22T23:00:00+07:00","Data":[{"currencyCode","transfer"}]}.
 * Dùng để lấy bù bảng cuối ngày thứ Năm đã qua (XML `pXML.aspx` chỉ có bảng hiện tại).
 */
export function parseVcbJson(json: string): VcbBoard {
  let d: unknown;
  try {
    d = JSON.parse(json);
  } catch {
    throw new VcbParseError("không phải JSON");
  }
  const o = d as { UpdatedDate?: unknown; Data?: unknown };
  const boardAt = typeof o.UpdatedDate === "string" ? new Date(o.UpdatedDate) : null;
  if (!boardAt || Number.isNaN(boardAt.getTime())) throw new VcbParseError("thiếu UpdatedDate");
  if (!Array.isArray(o.Data)) throw new VcbParseError("thiếu Data");
  const rates: VcbBoard["rates"] = [];
  for (const row of o.Data as { currencyCode?: unknown; transfer?: unknown }[]) {
    const currency = typeof row?.currencyCode === "string" ? row.currencyCode.trim() : "";
    const raw = typeof row?.transfer === "string" ? row.transfer.trim() : typeof row?.transfer === "number" ? String(row.transfer) : "";
    if (!currency || raw === "" || raw === "-") continue;
    const transfer = raw.replace(/,/g, "");
    if (!/^[A-Z]{3}$/.test(currency) || !/^\d+(\.\d+)?$/.test(transfer) || Number(transfer) <= 0) throw new VcbParseError(`dòng ${currency || "?"} sai định dạng (${raw})`);
    rates.push({ currency, transfer });
  }
  if (!rates.some((r) => r.currency === "USD")) throw new VcbParseError("thiếu USD");
  return { boardAt, rates };
}
