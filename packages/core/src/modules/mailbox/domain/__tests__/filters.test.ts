import { DEFAULT_MAIL_FILTERS, MailFiltersSchema, normalizeMailFilters, type MailFilters } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { matchesMailFilters, senderAllowed } from "../filters.js";

const msg = (v: Partial<{ fromEmail: string; subject: string; snippet: string; fileNames: string[] }> = {}) => ({
  fromEmail: "export@hansol.co.kr", subject: "Shipping documents", snippet: "", fileNames: ["scan.pdf"], ...v,
});
const f = (v: Partial<MailFilters>): MailFilters => ({ ...DEFAULT_MAIL_FILTERS, ...v });

describe("senderAllowed", () => {
  it("rỗng = mọi người gửi; email khớp đúng; tên miền khớp cả tên miền con, không khớp đuôi giống", () => {
    expect(senderAllowed("a@b.vn", [])).toBe(true);
    expect(senderAllowed("Export@Hansol.co.kr", ["export@hansol.co.kr"])).toBe(true);
    expect(senderAllowed("sales@hansol.co.kr", ["export@hansol.co.kr"])).toBe(false);
    expect(senderAllowed("ops@hansol.co.kr", ["@hansol.co.kr"])).toBe(true);
    expect(senderAllowed("ops@vn.hansol.co.kr", ["hansol.co.kr"])).toBe(true);
    expect(senderAllowed("ops@nothansol.co.kr", ["hansol.co.kr"])).toBe(false);
  });
});

describe("matchesMailFilters", () => {
  it("mặc định giống trước: cần từ khóa chứng từ ở tiêu đề / nội dung / tên file", () => {
    expect(matchesMailFilters(msg({ subject: "Invoice HD2610" }), DEFAULT_MAIL_FILTERS)).toBe(true);
    expect(matchesMailFilters(msg({ snippet: "gửi anh bộ chứng từ" }), DEFAULT_MAIL_FILTERS)).toBe(true);
    expect(matchesMailFilters(msg({ subject: "Mời họp", fileNames: ["lich.pdf"] }), DEFAULT_MAIL_FILTERS)).toBe(false);
  });
  it("DEFAULT + từ khóa thêm; CUSTOM chỉ dùng từ khóa riêng; OFF không lọc từ khóa", () => {
    const m = msg({ subject: "PO 2610-15 hàng về" });
    expect(matchesMailFilters(m, f({ keywords: ["po"] }))).toBe(true);
    expect(matchesMailFilters(msg({ subject: "Invoice" }), f({ keywordMode: "CUSTOM", keywords: ["po"] }))).toBe(false);
    expect(matchesMailFilters(m, f({ keywordMode: "CUSTOM", keywords: ["po"] }))).toBe(true);
    expect(matchesMailFilters(msg({ subject: "Mời họp" }), f({ keywordMode: "OFF" }))).toBe(true);
  });
  it("phạm vi SUBJECT bỏ qua nội dung; ALL + nhà cung cấp đã tìm toàn văn → không kiểm lại đoạn xem trước", () => {
    const body = msg({ subject: "Fw:", snippet: "invoice đính kèm" });
    expect(matchesMailFilters(body, f({ keywordScope: "SUBJECT" }))).toBe(false);
    expect(matchesMailFilters(body, f({ keywordScope: "ALL" }))).toBe(true);
    expect(matchesMailFilters(msg({ subject: "Fw:" }), f({ keywordScope: "ALL" }), { fullTextMatched: true })).toBe(true);
    expect(matchesMailFilters(msg({ subject: "Fw:" }), f({ keywordScope: "SUBJECT" }), { fullTextMatched: true })).toBe(false);
  });
  it("người gửi ngoài danh sách hoặc tiêu đề / tên file có từ loại trừ → bỏ", () => {
    const m = msg({ subject: "Invoice tháng 10" });
    expect(matchesMailFilters(m, f({ senders: ["@samsung.com"] }))).toBe(false);
    expect(matchesMailFilters(m, f({ senders: ["hansol.co.kr"] }))).toBe(true);
    expect(matchesMailFilters(m, f({ excludeKeywords: ["tháng 10"] }))).toBe(false);
    expect(matchesMailFilters(msg({ subject: "Invoice", fileNames: ["newsletter.pdf"] }), f({ excludeKeywords: ["newsletter"] }))).toBe(false);
  });
});

describe("MailFiltersSchema / normalizeMailFilters", () => {
  it("CUSTOM cần ít nhất 1 từ khóa; người gửi sai dạng bị chặn; chuẩn hóa chữ thường", () => {
    expect(MailFiltersSchema.safeParse(f({ keywordMode: "CUSTOM" })).success).toBe(false);
    expect(MailFiltersSchema.safeParse(f({ senders: ["không phải email"] })).success).toBe(false);
    expect(MailFiltersSchema.parse(f({ senders: [" Export@Hansol.CO.KR "] })).senders).toEqual(["export@hansol.co.kr"]);
  });
  it("dữ liệu cũ / thiếu trường / hỏng → mặc định", () => {
    expect(normalizeMailFilters(null)).toEqual(DEFAULT_MAIL_FILTERS);
    expect(normalizeMailFilters({ senders: ["a@b.vn"] })).toEqual({ ...DEFAULT_MAIL_FILTERS, senders: ["a@b.vn"] });
    expect(normalizeMailFilters({ extensions: [] })).toEqual(DEFAULT_MAIL_FILTERS);
  });
});
