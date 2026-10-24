import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { ErrorScreen, errorKindOf, type ErrorKind } from "./error-screen";
import { ERROR_SCREEN_MESSAGES } from "./error-screen.messages";

(globalThis as { React?: typeof React }).React = React;
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: () => {}, refresh: () => {}, push: () => {} }) }));

const html = (kind: ErrorKind, locale: UiLocale = "vi", extra: Partial<Parameters<typeof ErrorScreen>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(UiLocaleProvider, { locale, children: createElement(ErrorScreen, { kind, actions: null, ...extra }) }),
  );

describe("màn lỗi (404 / 500 / 502)", () => {
  it("phân loại: 502/503/504 + mất mạng → gateway; 5xx khác hoặc lỗi dựng ở máy chủ → server; còn lại → screen", () => {
    for (const status of [502, 503, 504]) expect(errorKindOf(new ApiError(`HTTP_${status}`, "x", status))).toBe("gateway");
    expect(errorKindOf(new ApiError("NETWORK", "x", 0))).toBe("gateway");
    expect(errorKindOf(new ApiError("HTTP_500", "x", 500))).toBe("server");
    expect(errorKindOf(Object.assign(new Error("x"), { digest: "123" }))).toBe("server");
    expect(errorKindOf(new ApiError("CONFLICT", "x", 409))).toBe("screen");
    expect(errorKindOf(new TypeError("undefined is not a function"))).toBe("screen");
  });

  it.each([
    ["not-found", "not-found", "Lỗi 404"],
    ["server", "server-error", "Lỗi 500"],
    ["gateway", "bad-gateway", "Lỗi 502"],
  ] as const)("%s: đúng hình, mã lỗi cho trình đọc màn hình", (kind, art, code) => {
    const out = html(kind);
    expect(out).toContain(`data-illustration="${art}"`);
    expect(out).toContain(code);
    expect(out).toContain(ERROR_SCREEN_MESSAGES.vi[`${kind}Title`]);
  });

  it("có mã tham chiếu thì hiện; cả trang thì có logo; đủ 3 ngôn ngữ", () => {
    expect(html("server", "vi", { reference: "abc123" })).toContain("abc123");
    expect(html("server")).not.toContain("Mã tham chiếu");
    expect(html("gateway", "vi", { fullPage: true })).toContain("KhaiBáo AI");
    expect(html("gateway", "en")).toContain("The server is not responding right now");
    expect(html("gateway", "zh")).toContain("服务器暂时无响应");
  });
});
