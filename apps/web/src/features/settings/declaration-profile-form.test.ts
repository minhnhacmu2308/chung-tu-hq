import { describe, expect, it } from "vitest";
import { initialPickedSources, profileFieldsFor, toProfileInput, validateProfileForm } from "./declaration-profile-form";

describe("declaration-profile-form", () => {
  it("NK có đủ ô mặc định; XK bỏ các ô chỉ có ở tờ khai nhập", () => {
    expect(profileFieldsFor("NK").map((f) => f.code)).toEqual(["MA_LH", "CQHQ", "PTVC", "KHO", "PT_TT", "KHAI_TG", "NGUOI_NT", "PL_CN", "HD_PL", "GIA_PL"]);
    expect(profileFieldsFor("XK").map((f) => f.code)).toEqual(["MA_LH", "CQHQ", "PTVC", "KHO", "PT_TT", "GIA_PL"]);
  });
  it("ô chọn mã dùng bảng mã, giá trị dạng “mã – tên” như trên tờ khai", () => {
    const lh = profileFieldsFor("NK").find((f) => f.code === "MA_LH")!;
    expect(lh.options?.[0]?.value).toMatch(/^A11 – /);
    expect(profileFieldsFor("XK").find((f) => f.code === "MA_LH")!.options?.[0]?.value).toMatch(/^B11 – /);
  });
  it("toProfileInput bỏ ô trống, giữ ghi đè", () => {
    expect(toProfileInput({ KHO: " 03CCS01 ", PT_TT: "" }, { KHO: { fixed: "02CIS01" } })).toEqual({ values: { KHO: "03CCS01" }, overrides: { KHO: { fixed: "02CIS01" } } });
  });
  it("KHO quá 7 ký tự (phần mã) → lỗi đúng ô", () => {
    expect(validateProfileForm("NK", { KHO: "QUA_DAI_12345" })).toEqual({ KHO: "Mã kho tối đa 7 ký tự" });
    expect(validateProfileForm("NK", { KHO: "03CCS01 – Kho CFS Tân Vũ" })).toEqual({});
  });
  it("hộp đổi nguồn: bỏ nguồn đã lưu nhưng không còn trong danh sách được phép; chưa ghi đè → mọi nguồn theo thứ tự", () => {
    const rule = { sources: [{ id: "an.warehouse", label: "Arrival Notice" }, { id: "profile.KHO", label: "Mặc định" }] };
    expect(initialPickedSources(rule, { sources: ["nguon.da.bo", "profile.KHO"] })).toEqual(["profile.KHO"]);
    expect(initialPickedSources(rule, undefined)).toEqual(["an.warehouse", "profile.KHO"]);
    expect(initialPickedSources(rule, { fixed: "X" })).toEqual(["an.warehouse", "profile.KHO"]);
  });
});
