// @vitest-environment jsdom
// Xác thực email: mở trang là gửi token (đúng một lần) → báo kết quả; liên kết hỏng → dẫn về đăng nhập (chưa có API gửi lại cho người dùng).
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/features/appearance/use-appearance";
import { ApiError } from "@/lib/api-error";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/verify-email",
  useSearchParams: () => new URLSearchParams(),
}));

// Bọc hàm mock thật để đếm số lần gọi (token chỉ dùng được một lần).
const verifyEmail = vi.fn();
vi.mock("@/api/session", async (orig) => {
  const real = await orig<typeof import("@/api/session")>();
  verifyEmail.mockImplementation(real.verifyEmail);
  return { ...real, verifyEmail: (token: string) => verifyEmail(token) };
});

const { VerifyEmailPage } = await import("./verify-email-page");

const T = { timeout: 5000 };
const render = (token: string) => renderWithProviders(<AppearanceProvider><VerifyEmailPage token={token} /></AppearanceProvider>);

describe("Trang xác thực email (/verify-email)", () => {
  it("đang xác thực → đã xác thực, có nút vào ứng dụng; gửi token đúng một lần; không vi phạm a11y", async () => {
    verifyEmail.mockClear();
    const { container } = render("mock-verify-token-0123456789");
    expect(screen.getByText("Đang xác thực email…", { selector: "p" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Đã xác thực email" }, T)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vào ứng dụng" }).getAttribute("href")).toBe("/");
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    expect(verifyEmail).toHaveBeenCalledWith("mock-verify-token-0123456789");
    await expectNoA11yViolations(container);
  }, 20_000);

  it("liên kết hết hạn (TOKEN_INVALID) → báo rõ và dẫn về đăng nhập; không vi phạm a11y", async () => {
    const { container } = render("expired-verify-token-00000");
    expect(await screen.findByRole("heading", { name: "Liên kết xác thực không hợp lệ hoặc đã hết hạn" }, T)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về trang đăng nhập" }).getAttribute("href")).toBe("/login");
    await expectNoA11yViolations(container);
  }, 20_000);

  it("liên kết thiếu token → báo không hợp lệ, không gọi server", () => {
    verifyEmail.mockClear();
    render("");
    expect(screen.getByRole("heading", { name: "Liên kết xác thực không hợp lệ hoặc đã hết hạn" })).toBeTruthy();
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it("liên kết bị cắt ngắn (token < 16 ký tự, sai dạng contracts) → báo không hợp lệ, không gọi server", () => {
    verifyEmail.mockClear();
    render("abc123");
    expect(screen.getByRole("heading", { name: "Liên kết xác thực không hợp lệ hoặc đã hết hạn" })).toBeTruthy();
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it("lỗi mạng → báo lỗi, có nút Thử lại (token chưa bị dùng)", async () => {
    verifyEmail.mockRejectedValueOnce(new ApiError("NETWORK", "Không kết nối được máy chủ", 0));
    render("mock-verify-token-0123456789");
    expect(await screen.findByRole("heading", { name: "Không xác thực được email" }, T)).toBeTruthy();
    expect(screen.getByText("Không kết nối được máy chủ")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  }, 20_000);
});
