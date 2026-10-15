// Tỷ giá tính thuế: tuần áp dụng (giờ VN) + đọc bảng XML Vietcombank (mẫu thật 15/10/2026).
import { UpsertExchangeRateInputSchema } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { VCB_XML_2026_10_15 } from "../__fixtures__/vcb-2026-10-15.js";
import { nextMonday, parseVcbXml, sameRateWeek, VcbParseError, vnDateOf, weekStart } from "../exchange-rate.js";

const XML = VCB_XML_2026_10_15;

describe("tuần tỷ giá (thứ Hai → Chủ nhật, giờ VN)", () => {
  it("weekStart: thứ Năm và Chủ nhật thuộc tuần bắt đầu thứ Hai 12/10", () => {
    expect(weekStart("2026-10-15")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
  });
  it("nextMonday: tối thứ Năm 23:30 VN → 19/10; 00:30 VN thứ Hai 19/10 → 26/10", () => {
    expect(nextMonday(new Date("2026-10-15T16:30:00Z"))).toBe("2026-10-19");
    expect(nextMonday(new Date("2026-10-18T17:30:00Z"))).toBe("2026-10-26");
  });
  it("sameRateWeek + vnDateOf: Chủ nhật 23:30 VN vẫn tuần cũ", () => {
    expect(sameRateWeek("2026-10-18", "2026-10-19")).toBe(false);
    expect(sameRateWeek("2026-10-13", "2026-10-18")).toBe(true);
    expect(vnDateOf(new Date("2026-10-18T16:30:00Z"))).toBe("2026-10-18");
    expect(vnDateOf(new Date("2026-10-18T17:30:00Z"))).toBe("2026-10-19");
  });
});

describe("parseVcbXml", () => {
  it("bảng thật: giờ bảng (giờ VN), cột Transfer dạng chuỗi thập phân; Buy '-' vẫn lấy Transfer", () => {
    const b = parseVcbXml(XML);
    expect(b.boardAt.toISOString()).toBe("2026-10-15T02:32:19.000Z");
    expect(b.rates.find((r) => r.currency === "USD")).toEqual({ currency: "USD", transfer: "25710.00" });
    expect(b.rates.find((r) => r.currency === "KRW")).toEqual({ currency: "KRW", transfer: "18.47" });
    expect(b.rates.find((r) => r.currency === "DKK")?.transfer).toBe("3807.34");
    expect(b.rates).toHaveLength(7);
  });
  it("dòng Transfer '-' bị bỏ; giờ PM đổi đúng", () => {
    const x = XML.replace('Transfer="83,580.80"', 'Transfer="-"').replace("9:32:19 AM", "11:30:00 PM");
    const b = parseVcbXml(x);
    expect(b.rates.some((r) => r.currency === "KWD")).toBe(false);
    expect(b.boardAt.toISOString()).toBe("2026-10-15T16:30:00.000Z");
  });
  it("HTML / thiếu USD / số sai → VcbParseError", () => {
    expect(() => parseVcbXml("<html><body>Bảo trì</body></html>")).toThrow(VcbParseError);
    expect(() => parseVcbXml(XML.replace(/<Exrate CurrencyCode="USD"[^>]*\/>/, ""))).toThrow(/USD/);
    expect(() => parseVcbXml(XML.replace('Transfer="25,710.00"', 'Transfer="abc"'))).toThrow(VcbParseError);
  });
});

describe("UpsertExchangeRateInputSchema", () => {
  const ok = { currency: "TWD", effectiveFrom: "2026-10-19", rate: "805.12", reason: "Tỷ giá chéo NHNN tuần 19/10" };
  it("nhận tỷ giá hợp lệ; từ chối ngày không phải thứ Hai, tỷ giá 0, mã tiền chữ thường", () => {
    expect(UpsertExchangeRateInputSchema.safeParse(ok).success).toBe(true);
    expect(UpsertExchangeRateInputSchema.safeParse({ ...ok, effectiveFrom: "2026-10-15" }).success).toBe(false);
    expect(UpsertExchangeRateInputSchema.safeParse({ ...ok, rate: "0" }).success).toBe(false);
    expect(UpsertExchangeRateInputSchema.safeParse({ ...ok, currency: "twd" }).success).toBe(false);
  });
});
