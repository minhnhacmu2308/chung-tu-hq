import { describe, expect, it } from "vitest";
import { prefillFromProfile } from "./profile-prefill";

describe("prefillFromProfile", () => {
  const form = { direction: "NK" as const, typeCode: "A11", customsOffice: null as string | null };
  it("lấy phần mã của mặc định khai báo (“mã – tên”) cho loại hình và chi cục", () => {
    expect(prefillFromProfile(form, { MA_LH: "A12 – Nhập kinh doanh sản xuất", CQHQ: "03CC – Chi cục HQ CK cảng Hải Phòng KV I" }, new Set())).toMatchObject({ typeCode: "A12", customsOffice: "03CC" });
  });
  it("không ghi đè ô người dùng đã chọn; không có mặc định thì giữ nguyên", () => {
    expect(prefillFromProfile(form, { MA_LH: "A12 – x", CQHQ: "03CC – y" }, new Set(["typeCode"]))).toMatchObject({ typeCode: "A11", customsOffice: "03CC" });
    expect(prefillFromProfile(form, {}, new Set())).toBe(form);
  });
});
