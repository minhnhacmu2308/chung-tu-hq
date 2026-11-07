// @vitest-environment jsdom
// Đặt lại mật khẩu từ liên kết email: kiểm mật khẩu như trang đăng ký → thành công dẫn về đăng nhập; liên kết hỏng → xin liên kết mới.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/db";
import { AppearanceProvider } from "@/features/appearance/use-appearance";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { ResetPasswordPage } from "./reset-password-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/reset-password",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 5000 };
const render = (token: string) => renderWithProviders(<AppearanceProvider><ResetPasswordPage token={token} /></AppearanceProvider>);

async function fill(password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText(/^Mật khẩu mới/), password);
  await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu/), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu mới" }));
}

beforeEach(() => resetDb());

describe("Trang đặt lại mật khẩu (/reset-password)", () => {
  it("mật khẩu hợp lệ → báo đã đặt và dẫn về đăng nhập; không vi phạm a11y", async () => {
    const { container } = render("mock-reset-token-0123456789");
    expect(screen.getByRole("heading", { name: "Đặt lại mật khẩu" })).toBeTruthy();
    await expectNoA11yViolations(container);
    await fill("matkhaumoi123", "matkhaumoi123");
    expect(await screen.findByRole("heading", { name: "Đã đặt mật khẩu mới" }, T)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Đăng nhập" }).getAttribute("href")).toBe("/login");
    await expectNoA11yViolations(container);
  }, 20_000);

  it("mật khẩu ngắn / nhập lại không khớp → báo lỗi tại ô, không gửi", async () => {
    render("mock-reset-token-0123456789");
    await fill("ngan", "ngan");
    expect(screen.getByText("Mật khẩu ít nhất 8 ký tự")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText(/^Mật khẩu mới/));
    await userEvent.clear(screen.getByLabelText(/Nhập lại mật khẩu/));
    await fill("matkhaumoi123", "matkhaumoi124");
    expect(screen.getByText("Mật khẩu nhập lại không khớp")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Đã đặt mật khẩu mới" })).toBeNull();
  }, 20_000);

  it("liên kết hết hạn (TOKEN_INVALID) → báo rõ, có nút xin liên kết mới và về đăng nhập; không vi phạm a11y", async () => {
    const { container } = render("expired-reset-token-000000");
    await fill("matkhaumoi123", "matkhaumoi123");
    expect(await screen.findByRole("heading", { name: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn" }, T)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Gửi lại liên kết mới" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.getByRole("link", { name: "Về trang đăng nhập" }).getAttribute("href")).toBe("/login");
    await expectNoA11yViolations(container);
  }, 20_000);

  it("liên kết thiếu token → báo không hợp lệ ngay, không hiện form", () => {
    render("");
    expect(screen.getByRole("heading", { name: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Đặt mật khẩu mới" })).toBeNull();
  });

  it("liên kết bị cắt ngắn (token < 16 ký tự, sai dạng contracts) → báo không hợp lệ ngay, không hiện form", () => {
    render("abc123");
    expect(screen.getByRole("heading", { name: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Đặt mật khẩu mới" })).toBeNull();
  });
});
