// Bảng tỷ giá công khai của Vietcombank (XML). Giới hạn của Vietcombank: 1 lần gọi / 5 phút – job chỉ gọi tối thứ Năm + thử lại mỗi 30 phút.
import type { VcbRateSource } from "../application/exchange-rates.js";

export const VCB_XML_URL = "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10";
/** Bảng theo ngày (JSON) – lấy bù bảng thứ Năm đã qua. */
export const VCB_DAY_URL = "https://www.vietcombank.com.vn/api/exchangerates";

export class HttpVcbRateSource implements VcbRateSource {
  constructor(private url = VCB_XML_URL, private fetchFn: typeof fetch = fetch, private timeoutMs = 20_000, private dayUrl = VCB_DAY_URL) {}
  async fetchBoard(): Promise<string> {
    const res = await this.fetchFn(this.url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: "text/xml" } });
    if (!res.ok) throw new Error(`Vietcombank trả HTTP ${res.status}`);
    return res.text();
  }
  async fetchBoardOn(date: string): Promise<string> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Ngày tỷ giá không hợp lệ: ${date}`);
    const res = await this.fetchFn(`${this.dayUrl}?date=${date}`, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Vietcombank trả HTTP ${res.status}`);
    return res.text();
  }
}
