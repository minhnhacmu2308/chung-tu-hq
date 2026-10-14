import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { IconTile } from "./icon-tile.js";

describe("IconTile", () => {
  it("chỉ để trang trí: aria-hidden, mặc định cỡ lg tông primary", async () => {
    const { container } = render(<p>Kết nối <IconTile icon={<svg />} /></p>);
    const tile = container.querySelector("svg")!.parentElement!;
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveClass("h-10", "w-10", "bg-primary-subtle", "text-primary-subtle-fg");
    await expectNoA11yViolations(container);
  });

  it.each([
    ["danger", "bg-danger-subtle"],
    ["warning", "bg-warning-subtle"],
    ["success", "bg-success-subtle"],
    ["info", "bg-info-subtle"],
    ["neutral", "bg-neutral-subtle"],
  ] as const)("tone=%s dùng token %s", (tone, cls) => {
    const { container } = render(<IconTile icon={<svg />} tone={tone} />);
    expect(container.firstElementChild).toHaveClass(cls);
  });

  it("size đổi kích thước ô; className gộp được", () => {
    const { container } = render(<IconTile icon={<svg />} size="sm" className="mt-0.5" />);
    expect(container.firstElementChild).toHaveClass("h-8", "w-8", "mt-0.5");
  });
});
