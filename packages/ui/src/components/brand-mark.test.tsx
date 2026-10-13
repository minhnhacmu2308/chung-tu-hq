import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { BrandMark } from "./brand-mark.js";

describe("BrandMark", () => {
  it("mặc định là ảnh có tên sản phẩm; nhãn ghi đè được", async () => {
    const { container } = render(<><BrandMark /><BrandMark labels={{ name: "Logo công ty" }} /></>);
    expect(screen.getByRole("img", { name: "KhaiBáo AI" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Logo công ty" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("decorative: ẩn với trình đọc màn hình khi đứng cạnh tên viết bằng chữ", () => {
    const { container } = render(<span><BrandMark decorative /> KhaiBáo AI</span>);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("vẽ bằng currentColor (màu theo token), bản small dùng dòng chỉ tiêu cao hơn", () => {
    const { container } = render(<><BrandMark className="text-primary" /><BrandMark small /></>);
    const [normal, small] = container.querySelectorAll("svg");
    expect(normal).toHaveAttribute("fill", "currentColor");
    expect(normal).toHaveClass("text-primary");
    expect(normal!.innerHTML).not.toBe(small!.innerHTML);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
