import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { detectBrowser, installStateOf } from "./install-prompt";
import { InstallAppCard } from "./install-app";
import { INSTALL_APP_MESSAGES } from "./install-app.messages";
import manifest from "@/app/manifest";

(globalThis as { React?: typeof React }).React = React;

const UA = {
  chrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
};

describe("cài ứng dụng máy tính (PWA)", () => {
  it("nhận diện trình duyệt theo user agent", () => {
    expect(detectBrowser(UA.chrome)).toBe("chromium");
    expect(detectBrowser(UA.edge)).toBe("chromium");
    expect(detectBrowser(UA.safari)).toBe("safari");
    expect(detectBrowser(UA.firefox)).toBe("firefox");
    expect(detectBrowser("curl/8")).toBe("other");
  });

  it("trạng thái: đã cài > cài được ngay > hướng dẫn tay; Firefox không hỗ trợ", () => {
    const base = { standalone: false, installedNow: false, hasPrompt: false, browser: "chromium" as const };
    expect(installStateOf({ ...base, standalone: true, hasPrompt: true })).toBe("installed");
    expect(installStateOf({ ...base, installedNow: true })).toBe("installed");
    expect(installStateOf({ ...base, hasPrompt: true })).toBe("available");
    expect(installStateOf(base)).toBe("manual");
    expect(installStateOf({ ...base, browser: "safari" })).toBe("manual");
    expect(installStateOf({ ...base, browser: "firefox" })).toBe("unsupported");
  });

  it("manifest đủ điều kiện cài: tên, start_url, standalone, icon 192 + 512 + maskable", () => {
    const m = manifest();
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    const sizes = (m.icons ?? []).map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  });

  it.each(["vi", "en", "zh"] as UiLocale[])("thẻ Ứng dụng trên máy tính hiện đúng ngôn ngữ (%s)", (locale) => {
    const html = renderToStaticMarkup(createElement(UiLocaleProvider, { locale, children: createElement(InstallAppCard) }));
    const t = INSTALL_APP_MESSAGES[locale];
    expect(html).toContain(t.title);
    expect(html).toContain('id="install-app"');
  });
});
