// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrgFavicon } from "./org-favicon";

const icon = () => document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')!;

describe("OrgFavicon", () => {
  it("trỏ favicon sang logo, áp lại khi Next dựng lại thẻ icon lúc chuyển trang, gỡ thì trả mặc định", async () => {
    document.head.innerHTML = '<link rel="icon" href="/icon.svg" type="image/svg+xml">';
    const { unmount } = render(<OrgFavicon href="/api/org/logo?v=1" />);
    expect(icon().getAttribute("href")).toBe("/api/org/logo?v=1");
    expect(icon().hasAttribute("type")).toBe(false);
    document.head.innerHTML = '<link rel="icon" href="/icon.svg" type="image/svg+xml">'; // như Next thay thẻ sau khi chuyển trang
    await new Promise((r) => setTimeout(r, 0));
    expect(icon().getAttribute("href")).toBe("/api/org/logo?v=1");
    unmount();
    expect(icon().getAttribute("href")).toBe("/icon.svg");
    expect(icon().getAttribute("type")).toBe("image/svg+xml");
  });
});
