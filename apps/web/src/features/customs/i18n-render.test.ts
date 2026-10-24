// Render các màn chính ở en/zh (SSR, không cần DOM) và kiểm nhãn đã dịch; bản vi giữ nguyên chữ cũ.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import * as React from "react";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// vitest của app dùng JSX kiểu classic (React.createElement) cho file .tsx → cấp React toàn cục.
(globalThis as { React?: typeof React }).React = React;

const { CustomsPage } = await import("./customs-page");
const { DashboardPage } = await import("@/features/dashboard/dashboard-page");
const { CreateDossierPage } = await import("@/features/dossiers/create-dossier-page");

function render(Page: ComponentType, locale: UiLocale) {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  return renderToStaticMarkup(
    createElement(UiLocaleProvider, { locale, children: createElement(QueryClientProvider, { client: qc }, createElement(Page)) }),
  );
}

describe("i18n – màn chính", () => {
  it("Khai báo Hải quan ở zh", () => {
    const html = render(CustomsPage, "zh");
    expect(html).toContain("海关申报");
    expect(html).toContain("打开档案列表");
    expect(html).toContain("待发送");
    expect(html).not.toContain("Khai báo Hải quan");
  });

  it("Tổng quan ở en", () => {
    const html = render(DashboardPage, "en");
    expect(html).toContain("Overview");
    expect(html).toContain("Create dossier");
    expect(html).not.toContain("Tổng quan");
  });

  it("Tạo hồ sơ ở zh / vi", () => {
    const zh = render(CreateDossierPage, "zh");
    expect(zh).toContain("创建申报档案");
    expect(zh).toContain("运输方式");
    expect(zh).toContain("A11 – 经营性进口（消费）");
    // Tên chi cục Hải quan là danh mục chính thức gửi backend – giữ tiếng Việt.
    const vi = render(CreateDossierPage, "vi");
    expect(vi).toContain("Tạo hồ sơ khai báo");
    expect(vi).toContain("Chứng từ gợi ý cần có");
  });
});
