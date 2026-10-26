// @vitest-environment jsdom
// Màn bắt đổi mật khẩu tạm: kiểm tra phía giao diện (bắt buộc, ≥ 8 ký tự, khác mật khẩu tạm, nhập lại khớp) rồi mới gọi đổi.
import { UiLocaleProvider } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/dom";

const changePassword = vi.fn(async (_input: { currentPassword: string; newPassword: string }) => ({ ok: true as const }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/api/session", () => ({ changePassword: (i: { currentPassword: string; newPassword: string }) => changePassword(i), logout: vi.fn(async () => ({ ok: true })) }));

import { ChangePasswordScreen } from "./change-password-screen";

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  // Màn này tự là <main> của trang (thay cả khung ứng dụng) → không bọc thêm <main> như renderWithProviders.
  return render(
    <QueryClientProvider client={client}>
      <UiLocaleProvider locale="vi">
        <ChangePasswordScreen />
      </UiLocaleProvider>
    </QueryClientProvider>,
  );
}

describe("ChangePasswordScreen", () => {
  it("bắt lỗi trước khi gửi; đúng → gọi đổi mật khẩu với mật khẩu tạm + mật khẩu mới; không vi phạm a11y", async () => {
    const { container } = setup();
    await expectNoA11yViolations(container);
    const submit = screen.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" });
    await userEvent.click(submit);
    expect(screen.getByText("Nhập mật khẩu tạm")).toBeTruthy();
    expect(screen.getByText("Mật khẩu mới ít nhất 8 ký tự")).toBeTruthy();

    await userEvent.type(screen.getByLabelText(/Mật khẩu tạm/), "TamThoi12345");
    await userEvent.type(screen.getByLabelText(/^Mật khẩu mới/), "TamThoi12345");
    await userEvent.click(submit);
    expect(screen.getByText("Mật khẩu mới phải khác mật khẩu tạm")).toBeTruthy();

    await userEvent.clear(screen.getByLabelText(/^Mật khẩu mới/));
    await userEvent.type(screen.getByLabelText(/^Mật khẩu mới/), "matkhaurieng123");
    await userEvent.type(screen.getByLabelText(/Nhập lại/), "matkhaurieng12");
    await userEvent.click(submit);
    expect(screen.getByText("Hai lần nhập không khớp")).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Nhập lại/), "3");
    await userEvent.click(submit);
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ currentPassword: "TamThoi12345", newPassword: "matkhaurieng123" }));
  });
});
