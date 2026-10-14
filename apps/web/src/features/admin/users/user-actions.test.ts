import { describe, expect, it } from "vitest";
import { availableUserActions } from "./user-actions";

const session = { id: "s1", device: "Chrome · Windows", ip: "203.0.113.5", lastSeenAt: "2026-10-13T02:00:00.000Z" };

describe("availableUserActions", () => {
  it("đang hoạt động, đã xác thực, có phiên → đặt lại mật khẩu, đăng xuất mọi phiên, khóa", () => {
    expect(availableUserActions({ status: "ACTIVE", emailVerified: true, sessions: [session] })).toEqual(["reset", "revoke", "disable"]);
  });
  it("đã khóa → chỉ mở khóa (không gửi đặt lại mật khẩu cho tài khoản đang khóa)", () => {
    expect(availableUserActions({ status: "DISABLED", emailVerified: true, sessions: [] })).toEqual(["enable"]);
  });
  it("mới được mời, chưa xác thực → chỉ gửi lại email xác thực", () => {
    expect(availableUserActions({ status: "INVITED", emailVerified: false, sessions: [] })).toEqual(["verify"]);
  });
  it("chờ duyệt tham gia, đã xác thực → không có thao tác nào (việc duyệt thuộc chủ doanh nghiệp)", () => {
    expect(availableUserActions({ status: "PENDING_JOIN", emailVerified: true, sessions: [] })).toEqual([]);
  });
});
