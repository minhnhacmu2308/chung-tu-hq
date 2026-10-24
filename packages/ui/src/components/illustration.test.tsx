import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { EmptyState } from "./feedback.js";
import { ILLUSTRATIONS, Illustration } from "./illustration.js";

describe("Illustration", () => {
  it.each(ILLUSTRATIONS)("vẽ hình %s, chỉ để trang trí (aria-hidden, không nhận focus)", (name) => {
    const { container } = render(<Illustration name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("data-illustration", name);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg.querySelectorAll("path, rect, circle, ellipse, text").length).toBeGreaterThan(3);
  });

  it("kích thước theo size (mặc định md)", () => {
    const { container, rerender } = render(<Illustration name="empty" />);
    expect(container.querySelector("svg")).toHaveClass("w-40");
    rerender(<Illustration name="empty" size="lg" />);
    expect(container.querySelector("svg")).toHaveClass("w-64");
  });

  it("chỉ dùng màu token (không mã màu, không fill/stroke thô)", () => {
    const { container } = render(<>{ILLUSTRATIONS.map((n) => <Illustration key={n} name={n} />)}</>);
    for (const el of container.querySelectorAll("*")) {
      for (const attr of ["fill", "stroke"]) {
        const v = el.getAttribute(attr);
        if (v !== null) expect(v).toBe("none");
      }
    }
  });
});

describe("EmptyState + hình minh họa", () => {
  it("không có icon → hình 'trống'; có icon → giữ icon; illustration chỉ định → đúng hình", () => {
    const { container, rerender } = render(<EmptyState title="Chưa có hồ sơ" />);
    expect(container.querySelector("[data-illustration=empty]")).not.toBeNull();
    rerender(<EmptyState icon={<span data-testid="ic" />} title="Chưa có hồ sơ" />);
    expect(container.querySelector("[data-illustration]")).toBeNull();
    rerender(<EmptyState illustration="not-found" title="Không tìm thấy trang" />);
    expect(container.querySelector("[data-illustration=not-found]")).not.toBeNull();
    expect(screen.getByText("Không tìm thấy trang")).toBeInTheDocument();
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<EmptyState illustration="error" title="Màn hình này gặp lỗi" description="Thử lại" />);
    await expectNoA11yViolations(container);
  });
});
