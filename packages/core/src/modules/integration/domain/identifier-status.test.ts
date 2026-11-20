import { describe, expect, it } from "vitest";
import { canDeleteIdentifier, identifierDisplayStatus, identifierExpiresOn, isExpiringSoon, vnToday } from "./identifier-status.js";

const row = (o: Partial<Parameters<typeof identifierDisplayStatus>[0]> = {}) =>
  ({ status: "ACCEPTED", identifierNo: "X", usedAt: null, identifiedOn: "2026-12-31", ...o }) as Parameters<typeof identifierDisplayStatus>[0];

describe("vnToday", () => {
  it("đổi sang ngày giờ Việt Nam (UTC+7)", () => {
    expect(vnToday(new Date("2026-12-31T16:59:59Z"))).toBe("2026-12-31");
    expect(vnToday(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
  });
});

describe("identifierExpiresOn", () => {
  it("hết hạn cuối năm cấp", () => {
    expect(identifierExpiresOn("2026-03-15")).toBe("2026-12-31");
    expect(identifierExpiresOn(null)).toBeNull();
  });
});

describe("identifierDisplayStatus", () => {
  it("displayStatus_expires_at_vn_midnight", () => {
    expect(identifierDisplayStatus(row(), vnToday(new Date("2026-12-31T16:59:00Z")))).toBe("AVAILABLE");
    expect(identifierDisplayStatus(row(), vnToday(new Date("2026-12-31T17:00:00Z")))).toBe("EXPIRED");
  });
  it("đã dùng giữ USED kể cả qua năm", () => {
    expect(identifierDisplayStatus(row({ usedAt: "2026-05-01T00:00:00Z" }), "2028-01-01")).toBe("USED");
  });
  it("trạng thái khác giữ nguyên", () => {
    expect(identifierDisplayStatus(row({ status: "SENDING" }), "2026-01-01")).toBe("SENDING");
    expect(identifierDisplayStatus(row({ status: "REJECTED" }), "2026-01-01")).toBe("REJECTED");
    expect(identifierDisplayStatus(row({ status: "NO_RESPONSE" }), "2026-01-01")).toBe("NO_RESPONSE");
  });
});

describe("isExpiringSoon", () => {
  it("trong 30 ngày cuối", () => {
    expect(isExpiringSoon("2026-12-31", "2026-11-30")).toBe(false);
    expect(isExpiringSoon("2026-12-31", "2026-12-01")).toBe(true);
    expect(isExpiringSoon(null, "2026-12-01")).toBe(false);
  });
});

describe("canDeleteIdentifier", () => {
  it("chỉ xóa bản ghi chưa có số", () => {
    expect(canDeleteIdentifier({ status: "REJECTED", identifierNo: null })).toBe(true);
    expect(canDeleteIdentifier({ status: "NO_RESPONSE", identifierNo: null })).toBe(true);
    expect(canDeleteIdentifier({ status: "SENDING", identifierNo: null })).toBe(false);
    expect(canDeleteIdentifier({ status: "ACCEPTED", identifierNo: "X" })).toBe(false);
    expect(canDeleteIdentifier({ status: "NO_RESPONSE", identifierNo: "X" })).toBe(false);
  });
});
