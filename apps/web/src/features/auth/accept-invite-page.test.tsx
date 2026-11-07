// @vitest-environment jsdom
// Nhận lời mời: đặt họ tên + mật khẩu (kiểm như trang đăng ký) → mock cấp phiên cho thành viên đang được mời → vào ứng dụng.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { AppearanceProvider } from "@/features/appearance/use-appearance";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { AcceptInvitePage } from "./accept-invite-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/accept-invite",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 5000 };
const TOKEN = "mock-invite-token-0123456789";
const render = (token: string) => renderWithProviders(<AppearanceProvider><AcceptInvitePage token={token} /></AppearanceProvider>);

beforeEach(() => {
  resetDb();
  push.mockClear();
});

describe("Trang nhận lời mời (/accept-invite)", () => {
  it("nhập đúng → thành viên được mời thành ACTIVE, đăng nhập luôn và vào trang tổng quan; không vi phạm a11y", async () => {
    const { container } = render(TOKEN);
    expect(screen.getByRole("heading", { name: "Nhận lời mời tham gia" })).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.type(screen.getByLabelText(/Họ và tên/), "Đỗ Khánh Linh");
    await userEvent.type(screen.getByLabelText(/^Mật khẩu/), "matkhaumoi123");
    await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu/), "matkhaumoi123");
    await userEvent.click(screen.getByRole("button", { name: "Tham gia doanh nghiệp" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"), T);
    const linh = getDb().members.find((m) => m.id === "usr_linh")!;
    expect(linh.status).toBe("ACTIVE");
    expect(getDb().currentUserId).toBe("usr_linh");
  }, 20_000);

  it("thiếu họ tên, mật khẩu ngắn, nhập lại không khớp → báo lỗi tại ô, không gửi", async () => {
    render(TOKEN);
    await userEvent.click(screen.getByRole("button", { name: "Tham gia doanh nghiệp" }));
    expect(screen.getByText("Nhập họ tên")).toBeTruthy();
    expect(screen.getByText("Mật khẩu ít nhất 8 ký tự")).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Họ và tên/), "Đỗ Khánh Linh");
    await userEvent.type(screen.getByLabelText(/^Mật khẩu/), "matkhaumoi123");
    await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu/), "matkhaumoi12");
    await userEvent.click(screen.getByRole("button", { name: "Tham gia doanh nghiệp" }));
    expect(screen.getByText("Mật khẩu nhập lại không khớp")).toBeTruthy();
    expect(screen.queryByText("Mật khẩu ít nhất 8 ký tự")).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(getDb().members.find((m) => m.id === "usr_linh")!.status).toBe("INVITED");
  }, 20_000);

  it("lời mời hết hạn (TOKEN_INVALID) → báo rõ và dẫn về đăng nhập; không vi phạm a11y", async () => {
    const { container } = render("expired-invite-token-0000");
    await userEvent.type(screen.getByLabelText(/Họ và tên/), "Đỗ Khánh Linh");
    await userEvent.type(screen.getByLabelText(/^Mật khẩu/), "matkhaumoi123");
    await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu/), "matkhaumoi123");
    await userEvent.click(screen.getByRole("button", { name: "Tham gia doanh nghiệp" }));
    expect(await screen.findByRole("heading", { name: "Lời mời không hợp lệ hoặc đã hết hạn" }, T)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về trang đăng nhập" }).getAttribute("href")).toBe("/login");
    expect(push).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  }, 20_000);

  it("liên kết thiếu token → báo lời mời không hợp lệ ngay, không hiện form", () => {
    render("");
    expect(screen.getByRole("heading", { name: "Lời mời không hợp lệ hoặc đã hết hạn" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tham gia doanh nghiệp" })).toBeNull();
  });

  it("liên kết bị cắt ngắn (token < 16 ký tự, sai dạng contracts) → báo lời mời không hợp lệ ngay, không hiện form", () => {
    render("abc123");
    expect(screen.getByRole("heading", { name: "Lời mời không hợp lệ hoặc đã hết hạn" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tham gia doanh nghiệp" })).toBeNull();
  });

  it("English: nhãn đổi theo ngôn ngữ", () => {
    renderWithProviders(<AppearanceProvider><AcceptInvitePage token={TOKEN} /></AppearanceProvider>, "en");
    expect(screen.getByRole("heading", { name: "Accept your invitation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join organization" })).toBeTruthy();
  });
});
