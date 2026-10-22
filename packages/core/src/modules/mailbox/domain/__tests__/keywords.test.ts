import { describe, expect, it } from "vitest";
import { matchesInboxKeywords } from "../keywords.js";

describe("matchesInboxKeywords", () => {
  it("khớp tiêu đề / tên file không phân biệt hoa thường, dấu, ký tự phân cách", () => {
    expect(matchesInboxKeywords("Gửi HÓA ĐƠN lô tháng 10")).toBe(true);
    expect(matchesInboxKeywords("Fw: draft B/L HPH2610")).toBe(true);
    expect(matchesInboxKeywords("Re: hàng về", "", "COMMERCIAL_INVOICE_2610.pdf")).toBe(true);
    expect(matchesInboxKeywords("Bo chung tu lo hang SGN")).toBe(true);
    expect(matchesInboxKeywords("Certificate of Origin form E")).toBe(true);
  });
  it("không khớp email thường; không khớp từ khóa ngắn nằm giữa từ khác", () => {
    expect(matchesInboxKeywords("Mời họp giao ban tuần", "Anh chị xem lịch đính kèm", "lich-hop.pdf")).toBe(false);
    expect(matchesInboxKeywords("Ảnh team building", "", "awbreakfast.jpg")).toBe(false);
    expect(matchesInboxKeywords("")).toBe(false);
  });
});
