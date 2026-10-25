import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Button } from "./button.js";

describe("Button", () => {
  it("wrap: nhãn dài được xuống dòng, chiều cao theo nội dung (không tràn khung hẹp)", () => {
    render(<Button size="sm" wrap>Tạo bản khai bổ sung cùng nội dung cho các tờ khác</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("whitespace-normal", "h-auto");
    expect(btn).not.toHaveClass("whitespace-nowrap", "h-8");
  });

  it("mặc định là type=button (không vô tình submit form)", () => {
    render(<Button>Lưu</Button>);
    expect(screen.getByRole("button", { name: "Lưu" })).toHaveAttribute("type", "button");
  });

  it("gọi onClick khi bấm và khi nhấn Enter", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Lưu</Button>);
    await userEvent.click(screen.getByRole("button"));
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("loading: khóa nút, đặt aria-busy, không gọi onClick", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Lưu</Button>);
    const btn = screen.getByRole("button", { name: "Lưu" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("asChild: render thẻ con (vd link) với style của nút", () => {
    render(
      <Button asChild variant="secondary">
        <a href="/ho-so">Hồ sơ</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Hồ sơ" });
    expect(link.className).toContain("bg-surface");
  });

  it.each(["primary", "secondary", "ghost", "danger", "link"] as const)("biến thể %s chỉ dùng class token", (variant) => {
    render(<Button variant={variant}>X</Button>);
    expect(screen.getByRole("button").className).not.toMatch(/#|rgb\(|-(red|blue|gray|green|slate)-\d/);
  });

  it("className truyền vào ghi đè được class mặc định (tailwind-merge)", () => {
    render(<Button className="h-12">X</Button>);
    const cls = screen.getByRole("button").className.split(" ");
    expect(cls).toContain("h-12");
    expect(cls).not.toContain("h-10");
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(
      <div>
        <Button>Lưu</Button>
        <Button loading>Đang lưu</Button>
        <Button size="icon" aria-label="Đóng">×</Button>
      </div>,
    );
    await expectNoA11yViolations(container);
  });

  it("size icon-sm: nút biểu tượng 24px (vừa dòng tên trên đường viền khung, vẫn đủ vùng bấm tối thiểu)", () => {
    render(<Button size="icon-sm" aria-label="Hướng dẫn">i</Button>);
    expect(screen.getByRole("button", { name: "Hướng dẫn" })).toHaveClass("h-6", "w-6");
  });
});
