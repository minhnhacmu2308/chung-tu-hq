// Hỗ trợ test component của apps/web (chạy trong jsdom: đặt `// @vitest-environment jsdom` ở đầu file test).
// Bọc QueryClient + TooltipProvider + Toaster như app thật; axe-core kiểm tra a11y (docs/TESTING.md §3).
import { Toaster, TooltipProvider, UiLocaleProvider, type UiLocale } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactElement } from "react";
import { afterEach, expect } from "vitest";

afterEach(() => cleanup());

// API trình duyệt jsdom chưa có mà Radix (Tooltip, Menu, Popover, Dialog) và cmdk cần.
if (typeof window !== "undefined") {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
}

export function renderWithProviders(ui: ReactElement, locale: UiLocale = "vi") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UiLocaleProvider locale={locale}>
        <TooltipProvider>
          {/* Như khung app thật: nội dung trang nằm trong <main>. */}
          <main>{ui}</main>
          <Toaster />
        </TooltipProvider>
      </UiLocaleProvider>
    </QueryClientProvider>,
  );
}

/** 0 vi phạm axe. Tắt "color-contrast" (jsdom không tính màu thật) và "region" (khối đứng riêng, không có landmark). */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  // iframes: false – jsdom không chạy được axe trong khung con (vd khung xem PDF); nội dung khung là file, không phải giao diện.
  const results = await axe.run(container, { iframes: false, rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}
