import { loadCodeList } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { initialPickedSources, profileFieldsFor, selectFor, toProfileInput, validateProfileForm } from "./declaration-profile-form";

describe("declaration-profile-form", () => {
  it("NK có đủ ô mặc định; XK bỏ các ô chỉ có ở tờ khai nhập", () => {
    expect(profileFieldsFor("NK").map((f) => f.code)).toEqual(["MA_LH", "CQHQ", "PTVC", "KHO", "PT_TT", "KHAI_TG", "NGUOI_NT", "PL_CN", "HD_PL", "GIA_PL"]);
    expect(profileFieldsFor("XK").map((f) => f.code)).toEqual(["MA_LH", "CQHQ", "PTVC", "KHO", "PT_TT", "NGUOI_NT", "GIA_PL"]);
    expect(profileFieldsFor("XK").find((f) => f.code === "NGUOI_NT")?.placeholder).toBe("1 – Người xuất khẩu");
  });
  it("ô chọn mã dài lấy từ danh mục VNACCS chính thức (A038, PAYMENT, TYPE_CODE), giá trị dạng “mã – tên” như trên tờ khai", async () => {
    const [offices, payments, typeCodes] = await Promise.all([loadCodeList("A038"), loadCodeList("PAYMENT"), loadCodeList("TYPE_CODE")]);
    const nk = profileFieldsFor("NK", "vi", { offices, payments, typeCodes });
    expect(nk.find((f) => f.code === "MA_LH")!.options?.[0]?.value).toBe("A11 – Nhập kinh doanh tiêu dùng");
    expect(nk.find((f) => f.code === "MA_LH")!.options?.some((o) => o.value.startsWith("B11"))).toBe(false);
    expect(profileFieldsFor("XK", "vi", { typeCodes }).find((f) => f.code === "MA_LH")!.options?.[0]?.value).toMatch(/^B11 – /);
    expect(nk.find((f) => f.code === "CQHQ")!.options?.length).toBe(offices.filter((e) => !e.inactive).length);
    expect(nk.find((f) => f.code === "PT_TT")!.options?.map((o) => o.value)).toContain("TTR – Điện chuyển tiền");
    // Danh mục chưa tải → chưa có lựa chọn (không rơi về bảng mã cũ).
    expect(profileFieldsFor("NK").find((f) => f.code === "CQHQ")!.options).toEqual([]);
  });
  it("selectFor: giá trị đã lưu theo tên cũ khớp lựa chọn cùng mã; mã không còn trong danh mục vẫn hiện", () => {
    const options = [{ value: "TTR – Điện chuyển tiền", label: "TTR – Điện chuyển tiền" }];
    expect(selectFor(options, "TTR – Chuyển tiền bằng điện").value).toBe("TTR – Điện chuyển tiền");
    expect(selectFor(options, "")).toEqual({ value: "", options });
    const legacy = selectFor(options, "H-D-H – Hàng đổi hàng");
    expect(legacy.value).toBe("H-D-H – Hàng đổi hàng");
    expect(legacy.options[0]).toEqual({ value: "H-D-H – Hàng đổi hàng", label: "H-D-H – Hàng đổi hàng" });
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
