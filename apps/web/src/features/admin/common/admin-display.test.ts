import { describe, expect, it } from "vitest";
import { STAFF_PERMISSIONS } from "@kb/contracts";
import { audienceLabel, monthLabel, PERMISSION_LABELS, PERMISSION_ORDER } from "./admin-display";

describe("nhãn hiển thị", () => {
  it("monthLabel bỏ số 0 đầu của tháng", () => {
    expect(monthLabel("2026-10")).toBe("Tháng 10/2026");
    expect(monthLabel("2026-03")).toBe("Tháng 3/2026");
  });
  it("audienceLabel dùng tên gói khi có, không thì dùng mã", () => {
    expect(audienceLabel("ALL")).toBe("Mọi doanh nghiệp");
    expect(audienceLabel("PAYG", { PAYG: "Theo lượt" })).toBe("Gói Theo lượt");
    expect(audienceLabel("CONTRACT")).toBe("Gói CONTRACT");
  });
  it("nhãn theo ngôn ngữ (en/zh)", () => {
    expect(monthLabel("2026-03", "zh")).toBe("2026年3月");
    expect(audienceLabel("ALL", {}, "en")).toBe("All organizations");
  });
  it("bảng quyền hiển thị phủ đủ mọi quyền được cấp cho các vai trò", () => {
    const granted = new Set(Object.values(STAFF_PERMISSIONS).flat());
    expect(new Set(PERMISSION_ORDER)).toEqual(granted);
    for (const locale of ["vi", "en", "zh"] as const) for (const p of granted) expect(PERMISSION_LABELS[locale][p]).toBeTruthy();
  });
});
