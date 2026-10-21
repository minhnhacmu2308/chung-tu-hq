import { describe, expect, it } from "vitest";
import { InviteMemberInputSchema, LoginInputSchema, OrgProfileInputSchema, PostalCodeSchema, RegisterInputSchema, TaxCodeSchema } from "./identity.js";

describe("contract identity", () => {
  it("email chuẩn hóa lowercase + trim", () => {
    expect(LoginInputSchema.parse({ email: "  Chau.Le@AnPhat-Demo.vn ", password: "x" }).email).toBe("chau.le@anphat-demo.vn");
  });
  it.each(["0316789012", "0316 789 012", "0316789012-001"])("TaxCode %s → chỉ giữ chữ số, 10 hoặc 13 số", (v) => {
    expect(["0316789012", "0316789012001"]).toContain(TaxCodeSchema.parse(v));
  });
  it("TaxCode 9 số bị từ chối", () => {
    expect(TaxCodeSchema.safeParse("031678901").success).toBe(false);
  });
  it("Register: mật khẩu < 8 ký tự bị từ chối", () => {
    expect(RegisterInputSchema.safeParse({ email: "a@b.vn", name: "An", password: "1234567", taxCode: "0316789012", joinExisting: false }).success).toBe(false);
  });
  it("Invite: không cho vai trò OWNER", () => {
    expect(InviteMemberInputSchema.safeParse({ email: "a@b.vn", role: "OWNER" }).success).toBe(false);
    expect(InviteMemberInputSchema.parse({ email: "a@b.vn", role: "VIEWER" }).role).toBe("VIEWER");
  });
  it("Mã bưu chính: 6 chữ số (trim) hoặc rỗng; sai định dạng bị từ chối", () => {
    expect(PostalCodeSchema.parse(" 180000 ")).toBe("180000");
    expect(PostalCodeSchema.parse("")).toBe("");
    for (const bad of ["18000", "1800000", "18A000", "180 000"]) expect(PostalCodeSchema.safeParse(bad).success).toBe(false);
  });
  it("Hồ sơ doanh nghiệp: mã bưu chính tùy chọn (không gửi = giữ nguyên)", () => {
    expect(OrgProfileInputSchema.parse({ name: "A", address: "", phone: "" }).postalCode).toBeUndefined();
    expect(OrgProfileInputSchema.safeParse({ name: "A", address: "", phone: "", postalCode: "12" }).success).toBe(false);
  });
});
