import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { loginErrorMessage } from "./login-error";

describe("loginErrorMessage", () => {
  it("tài khoản chờ duyệt / bị khóa / sai quá nhiều lần: hiện lý do từ backend", () => {
    expect(loginErrorMessage(new ApiError("MEMBERSHIP_PENDING", "Yêu cầu tham gia đang chờ Chủ sở hữu duyệt", 403))).toBe("Yêu cầu tham gia đang chờ Chủ sở hữu duyệt");
    expect(loginErrorMessage(new ApiError("MEMBERSHIP_DISABLED", "Tài khoản đã bị khóa trong doanh nghiệp", 403))).toBe("Tài khoản đã bị khóa trong doanh nghiệp");
    expect(loginErrorMessage(new ApiError("RATE_LIMITED", "Đăng nhập sai quá nhiều lần, thử lại sau 15 phút", 429))).toMatch(/15 phút/);
  });

  it("sai email/mật khẩu và lỗi lạ: câu chung, không lộ email có tồn tại hay không", () => {
    expect(loginErrorMessage(new ApiError("INVALID_CREDENTIALS", "Email không tồn tại", 401))).toBe("Sai email hoặc mật khẩu.");
    expect(loginErrorMessage(new Error("boom"))).toBe("Sai email hoặc mật khẩu.");
  });
});
