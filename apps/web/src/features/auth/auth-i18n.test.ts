// Trang đăng nhập/đăng ký đổi ngôn ngữ được khi chưa đăng nhập: ô chọn ngôn ngữ → cấu hình giao diện → nhãn theo ngôn ngữ.
// apps/web chạy vitest môi trường node (không có DOM) → dựng HTML tĩnh bằng react-dom/server.
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import { DEFAULT_APPEARANCE } from "@kb/ui/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

// vitest của apps/web dùng JSX kiểu cũ (React.createElement) → cấp React toàn cục cho component .tsx.
(globalThis as { React?: typeof React }).React = React;

const { AppearanceProvider } = await import("@/features/appearance/use-appearance");
const { withLocale } = await import("@/features/appearance/language-switcher");
const { LoginPage } = await import("./login-page");
const { RegisterPage } = await import("./register-page");

function render(locale: UiLocale, page: ComponentType) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client: qc,
      children: createElement(AppearanceProvider, { children: createElement(UiLocaleProvider, { locale, children: createElement(page) }) }),
    }),
  );
}

describe("chọn ngôn ngữ ở trang đăng nhập", () => {
  it("chọn en/zh → cấu hình giao diện đổi locale, giữ các tùy chọn khác", () => {
    const base = { ...DEFAULT_APPEARANCE, locale: "vi" as const };
    expect(withLocale(base, "en")).toEqual({ ...base, locale: "en" });
    expect(withLocale(base, "zh")?.locale).toBe("zh");
    expect(withLocale(base, "vi")).toBeNull();
    expect(withLocale(base, "fr")).toBeNull();
  });

  it("có ô chọn ngôn ngữ với 3 lựa chọn, đang chọn đúng ngôn ngữ hiện tại", () => {
    const html = render("vi", LoginPage);
    expect(html).toContain('aria-label="Ngôn ngữ"');
    expect(html).toContain("Tiếng Việt");
    expect(html).toContain("English");
    expect(html).toContain("中文");
  });

  it("tiếng Việt giữ nguyên nhãn cũ", () => {
    const html = render("vi", LoginPage);
    expect(html).toContain("Đăng nhập");
    expect(html).toContain("Ghi nhớ đăng nhập");
    expect(html).toContain("Quên mật khẩu?");
  });

  it("English: nhãn trang đăng nhập đổi sang tiếng Anh", () => {
    const html = render("en", LoginPage);
    expect(html).toContain("Sign in");
    expect(html).toContain("Remember me");
    expect(html).toContain("Forgot password?");
    expect(html).toContain('aria-label="Language"');
    expect(html).not.toContain("Ghi nhớ đăng nhập");
  });

  it("中文: nhãn trang đăng nhập và đăng ký đổi sang tiếng Trung", () => {
    const login = render("zh", LoginPage);
    expect(login).toContain("登录");
    expect(login).toContain("忘记密码？");
    expect(login).toContain("从单证到海关报关单，一条流程完成。");
    const register = render("zh", RegisterPage);
    expect(register).toContain("企业注册");
    expect(register).toContain("工作邮箱");
    expect(register).not.toContain("Đăng ký doanh nghiệp");
  });
});
