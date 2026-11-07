import { describe, expect, it } from "vitest";
import { contractCoversMonth, contractStatus, vnMonthOf } from "../contract.js";

// 2026-11-07 10:00 giờ VN = 03:00 UTC.
const NOW = new Date("2026-11-07T03:00:00Z");

describe("contractStatus (giờ VN)", () => {
  it("chưa có ngày kết thúc → ACTIVE, daysLeft null", () => {
    expect(contractStatus({ endsOn: null }, NOW)).toEqual({ status: "ACTIVE", daysLeft: null });
  });
  it("biên 30 ngày: còn 31 ngày ACTIVE, còn 30 ngày EXPIRING, hôm nay là ngày cuối EXPIRING (0)", () => {
    expect(contractStatus({ endsOn: "2026-12-08" }, NOW)).toEqual({ status: "ACTIVE", daysLeft: 31 });
    expect(contractStatus({ endsOn: "2026-12-07" }, NOW)).toEqual({ status: "EXPIRING", daysLeft: 30 });
    expect(contractStatus({ endsOn: "2026-11-07" }, NOW)).toEqual({ status: "EXPIRING", daysLeft: 0 });
  });
  it("biên 7 ngày ân hạn: quá 1 ngày GRACE, quá 7 ngày GRACE, quá 8 ngày EXPIRED", () => {
    expect(contractStatus({ endsOn: "2026-11-06" }, NOW)).toEqual({ status: "GRACE", daysLeft: -1 });
    expect(contractStatus({ endsOn: "2026-10-31" }, NOW)).toEqual({ status: "GRACE", daysLeft: -7 });
    expect(contractStatus({ endsOn: "2026-10-30" }, NOW)).toEqual({ status: "EXPIRED", daysLeft: -8 });
  });
  it("tính theo ngày VN, không theo UTC: 23:30 UTC ngày 6 đã là ngày 7 ở VN", () => {
    const lateUtc = new Date("2026-11-06T17:30:00Z"); // 00:30 ngày 7/11 giờ VN
    expect(contractStatus({ endsOn: "2026-11-06" }, lateUtc).status).toBe("GRACE");
    const beforeMidnightVn = new Date("2026-11-06T16:59:00Z"); // 23:59 ngày 6/11 giờ VN
    expect(contractStatus({ endsOn: "2026-11-06" }, beforeMidnightVn)).toEqual({ status: "EXPIRING", daysLeft: 0 });
  });
});

describe("contractCoversMonth / vnMonthOf", () => {
  it("hợp đồng phủ ít nhất một ngày của tháng", () => {
    expect(contractCoversMonth({ startsOn: "2026-01-15", endsOn: "2027-01-14" }, "2026-11")).toBe(true);
    expect(contractCoversMonth({ startsOn: "2026-11-30", endsOn: null }, "2026-11")).toBe(true);
    expect(contractCoversMonth({ startsOn: "2026-12-01", endsOn: null }, "2026-11")).toBe(false);
    expect(contractCoversMonth({ startsOn: null, endsOn: "2026-10-31" }, "2026-11")).toBe(false);
    expect(contractCoversMonth({ startsOn: null, endsOn: null }, "2026-11")).toBe(true);
  });
  it("tháng VN và khoảng UTC của tháng", () => {
    expect(vnMonthOf(new Date("2026-10-31T17:00:00Z"))).toEqual({ month: "2026-11", from: new Date("2026-10-31T17:00:00Z"), to: new Date("2026-11-30T17:00:00Z") });
  });
});
