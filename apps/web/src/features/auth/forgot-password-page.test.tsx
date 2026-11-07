// @vitest-environment jsdom
// Quên mật khẩu: nhập email → luôn báo "đã gửi" (không lộ email có tồn tại); email sai định dạng báo tại ô.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/features/appearance/use-appearance";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { ForgotPasswordPage } from "./forgot-password-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/forgot-password",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 5000 };

describe("Trang quên mật khẩu (/forgot-password)", () => {
  it("email mang sang từ trang đăng nhập → gửi → báo đã gửi; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<AppearanceProvider><ForgotPasswordPage initialEmail="chau.le@anphat-demo.vn" /></AppearanceProvider>);
    expect(screen.getByRole("heading", { name: "Quên mật khẩu" })).toBeTruthy();
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("chau.le@anphat-demo.vn");
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Gửi liên kết đặt lại" }));
    expect(await screen.findByRole("heading", { name: "Đã gửi yêu cầu" }, T)).toBeTruthy();
    expect(screen.getByText(/Nếu chau\.le@anphat-demo\.vn có tài khoản/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về trang đăng nhập" }).getAttribute("href")).toBe("/login");
  }, 20_000);

  it("email sai định dạng → báo tại ô, không gửi", async () => {
    renderWithProviders(<AppearanceProvider><ForgotPasswordPage /></AppearanceProvider>);
    await userEvent.type(screen.getByLabelText(/Email/), "khong-phai-email");
    await userEvent.click(screen.getByRole("button", { name: "Gửi liên kết đặt lại" }));
    expect(screen.getByText("Email không hợp lệ")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Đã gửi yêu cầu" })).toBeNull();
  }, 20_000);
});
