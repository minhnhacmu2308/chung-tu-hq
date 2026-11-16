// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { DesktopNotificationSettings } from "./desktop-notification-settings";
import { DESKTOP_SCOPE_KEY, wantsDesktop } from "./desktop-notifications";

class FakeNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn(async () => (FakeNotification.permission = "granted"));
}

beforeEach(() => {
  FakeNotification.permission = "default";
  vi.stubGlobal("Notification", FakeNotification);
  localStorage.removeItem(DESKTOP_SCOPE_KEY);
});
afterEach(() => vi.unstubAllGlobals());

const openSettings = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Cài đặt thông báo" }));
  return screen.findByRole("dialog", { name: "Thông báo trên máy tính" });
};

describe("DesktopNotificationSettings", () => {
  it("chưa bật → nút Bật xin quyền khi bấm, chuyển sang Đã bật; không vi phạm a11y", async () => {
    renderWithProviders(<DesktopNotificationSettings />);
    await openSettings();
    expect(screen.getByText("Chưa bật")).toBeTruthy();
    await expectNoA11yViolations(document.body);
    await userEvent.click(screen.getByRole("button", { name: "Bật" }));
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Đã bật")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bật" })).toBeNull();
  });

  it("bị chặn → hướng dẫn mở quyền trong trình duyệt", async () => {
    FakeNotification.permission = "denied";
    renderWithProviders(<DesktopNotificationSettings />);
    await openSettings();
    expect(screen.getByText("Bị chặn")).toBeTruthy();
    expect(screen.getByText(/biểu tượng ổ khóa/)).toBeTruthy();
  });

  it("không hỗ trợ → báo không hỗ trợ, khóa ô phạm vi", async () => {
    vi.unstubAllGlobals();
    const saved = (window as { Notification?: unknown }).Notification;
    delete (window as { Notification?: unknown }).Notification;
    try {
      renderWithProviders(<DesktopNotificationSettings />);
      await openSettings();
      expect(screen.getByText("Không hỗ trợ")).toBeTruthy();
      expect((screen.getByRole("combobox", { name: "Báo cho" }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      if (saved) (window as { Notification?: unknown }).Notification = saved;
    }
  });

  it("đổi phạm vi lưu theo trình duyệt (localStorage)", async () => {
    renderWithProviders(<DesktopNotificationSettings />);
    await openSettings();
    await userEvent.click(screen.getByRole("combobox", { name: "Báo cho" }));
    await userEvent.click(await screen.findByRole("option", { name: "Mọi thông báo" }));
    expect(localStorage.getItem(DESKTOP_SCOPE_KEY)).toBe("all");
  });
});

describe("wantsDesktop", () => {
  const o = { scope: "customs" as const, permission: "granted" as const, pageActive: false };
  it("chỉ khi đã cho phép, trang không được nhìn và đúng phạm vi", () => {
    expect(wantsDesktop("CUSTOMS", o)).toBe(true);
    expect(wantsDesktop("DOSSIER", o)).toBe(false);
    expect(wantsDesktop("DOSSIER", { ...o, scope: "all" })).toBe(true);
    expect(wantsDesktop("CUSTOMS", { ...o, scope: "off" })).toBe(false);
    expect(wantsDesktop("CUSTOMS", { ...o, pageActive: true })).toBe(false);
    expect(wantsDesktop("CUSTOMS", { ...o, permission: "default" })).toBe(false);
    expect(wantsDesktop("CUSTOMS", { ...o, permission: "unsupported" })).toBe(false);
  });
});
