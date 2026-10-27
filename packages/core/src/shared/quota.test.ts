import { describe, expect, it } from "vitest";
import { activeQuotaBonus, vnMonth, withinDossierQuota } from "./quota.js";

const NOW = new Date("2026-10-14T03:00:00Z");

describe("hạn mức hồ sơ", () => {
  it("tháng theo giờ Việt Nam", () => {
    expect(vnMonth(new Date("2026-10-31T18:00:00Z"))).toBe("2026-11");
  });

  it("hồ sơ nới thêm chỉ có hiệu lực đúng tháng đã nới", () => {
    expect(activeQuotaBonus({ quotaBonus: 20, quotaBonusMonth: "2026-10" }, NOW)).toBe(20);
    expect(activeQuotaBonus({ quotaBonus: 20, quotaBonusMonth: "2026-09" }, NOW)).toBe(0);
    expect(activeQuotaBonus({ quotaBonus: 20, quotaBonusMonth: null }, NOW)).toBe(0);
  });

  it("so tổng SAU khi tạo với gói + nới thêm (đã dùng 5/10 vẫn tạo được hồ sơ thứ 6)", () => {
    const none = { quotaBonus: 0, quotaBonusMonth: null };
    expect(withinDossierQuota(10, none, 6, NOW)).toBe(true);
    expect(withinDossierQuota(10, none, 10, NOW)).toBe(true);
    expect(withinDossierQuota(10, none, 11, NOW)).toBe(false);
    expect(withinDossierQuota(10, { quotaBonus: 5, quotaBonusMonth: "2026-10" }, 15, NOW)).toBe(true);
    expect(withinDossierQuota(10, { quotaBonus: 5, quotaBonusMonth: "2026-09" }, 11, NOW)).toBe(false);
  });
});
