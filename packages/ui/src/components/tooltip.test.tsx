import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Tooltip } from "./tooltip.js";

// jsdom thiếu API mà Radix dùng
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

describe("Tooltip", () => {
  it("hiện khi focus bằng bàn phím và gắn làm mô tả cho nút", async () => {
    render(
      <Tooltip content="Thu gọn menu" delay={0}>
        <button type="button" aria-label="Thu gọn">‹</button>
      </Tooltip>,
    );
    await userEvent.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Thu gọn menu");
    expect(screen.getByRole("button", { name: "Thu gọn" })).toHaveAccessibleDescription("Thu gọn menu");
  });

  it("hiện khi rê chuột, ẩn khi nhấn Escape", async () => {
    render(
      <Tooltip content="Xuất Excel" delay={0}>
        <button type="button">X</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Xuất Excel");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("không vi phạm a11y khi đang hiện", async () => {
    const { container } = render(
      <Tooltip content="Gợi ý" delay={0}>
        <button type="button">?</button>
      </Tooltip>,
    );
    await userEvent.tab();
    await screen.findByRole("tooltip");
    await expectNoA11yViolations(container);
  });
});
