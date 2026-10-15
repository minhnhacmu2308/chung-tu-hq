// Bảng tỷ giá công khai của Vietcombank (XML). Giới hạn của Vietcombank: 1 lần gọi / 5 phút – job chỉ gọi tối thứ Năm + thử lại mỗi 30 phút.
import type { VcbRateSource } from "../application/exchange-rates.js";

export const VCB_XML_URL = "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10";

export class HttpVcbRateSource implements VcbRateSource {
  constructor(private url = VCB_XML_URL, private fetchFn: typeof fetch = fetch, private timeoutMs = 20_000) {}
  async fetchBoard(): Promise<string> {
    const res = await this.fetchFn(this.url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: "text/xml" } });
    if (!res.ok) throw new Error(`Vietcombank trả HTTP ${res.status}`);
    return res.text();
  }
}
