import { describe, expect, it } from "vitest";
import { STAFF_PERMISSIONS } from "@kb/contracts";
import { audienceLabel, monthLabel, PERMISSION_LABELS, PERMISSION_ORDER, quotaState } from "./admin-display";

describe("quotaState", () => {
  it.each([
    [37, 150, "primary", "Trong hạn mức", 25],
    [134, 150, "primary", "Trong hạn mức", 89],
    [135, 150, "warning", "Sắp hết hạn mức", 90],
    [149, 150, "warning", "Sắp hết hạn mức", 99],
    [150, 150, "danger", "Hết hạn mức", 100],
    [51, 50, "danger", "Vượt hạn mức", 102],
  ] as const)("%i/%i hồ sơ → %s (%s)", (used, limit, tone, label, percent) => {
    expect(quotaState(used, limit)).toMatchObject({ tone, label, percent });
  });
  it("chưa dùng gì → 0%", () => {
    expect(quotaState(0, 50)).toMatchObject({ percent: 0, tone: "primary" });
  });
  it("hạn mức 0 (không giới hạn) không chia cho 0", () => {
    expect(quotaState(12, 0)).toEqual({ ratio: 0, percent: 0, tone: "primary", label: "Không giới hạn" });
  });
});

describe("nhãn hiển thị", () => {
  it("monthLabel bỏ số 0 đầu của tháng", () => {
    expect(monthLabel("2026-10")).toBe("Tháng 10/2026");
    expect(monthLabel("2026-03")).toBe("Tháng 3/2026");
  });
  it("audienceLabel dùng tên gói khi có, không thì dùng mã", () => {
    expect(audienceLabel("ALL")).toBe("Mọi doanh nghiệp");
    expect(audienceLabel("PRO", { PRO: "Chuyên nghiệp" })).toBe("Gói Chuyên nghiệp");
    expect(audienceLabel("BASIC")).toBe("Gói BASIC");
  });
  it("bảng quyền hiển thị phủ đủ mọi quyền được cấp cho các vai trò", () => {
    const granted = new Set(Object.values(STAFF_PERMISSIONS).flat());
    expect(new Set(PERMISSION_ORDER)).toEqual(granted);
    for (const p of granted) expect(PERMISSION_LABELS[p]).toBeTruthy();
  });
});
