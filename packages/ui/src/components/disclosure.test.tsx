import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Disclosure } from "./disclosure.js";

describe("Disclosure", () => {
  it("mặc định đóng: aria-expanded=false, nội dung không hiện", async () => {
    const { container } = render(<Disclosure title="Thông tin khác">nội dung</Disclosure>);
    expect(screen.getByRole("button", { name: /Thông tin khác/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("nội dung")).not.toBeVisible();
    await expectNoA11yViolations(container);
  });

  it("bấm mở/đóng, gọi onOpenChange", async () => {
    const onOpenChange = vi.fn();
    render(<Disclosure title="Thông tin khác" onOpenChange={onOpenChange}>nội dung</Disclosure>);
    const btn = screen.getByRole("button", { name: /Thông tin khác/ });
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("nội dung")).toBeVisible();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("bàn phím: Enter và Space mở/đóng", async () => {
    render(<Disclosure title="Lịch sử">nội dung</Disclosure>);
    const btn = screen.getByRole("button", { name: /Lịch sử/ });
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(btn).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard(" ");
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("defaultOpen mở sẵn; nút trỏ tới vùng nội dung (aria-controls)", async () => {
    const { container } = render(<Disclosure title="Dòng 1" defaultOpen>nội dung</Disclosure>);
    const btn = screen.getByRole("button", { name: /Dòng 1/ });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).toHaveTextContent("nội dung");
    await expectNoA11yViolations(container);
  });

  it("open điều khiển từ ngoài: bấm chỉ báo onOpenChange, không tự đổi", async () => {
    const onOpenChange = vi.fn();
    render(<Disclosure title="Thông điệp" open={false} onOpenChange={onOpenChange}>nội dung</Disclosure>);
    const btn = screen.getByRole("button", { name: /Thông điệp/ });
    await userEvent.click(btn);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("meta hiện cạnh tiêu đề, actions nằm ngoài nút tiêu đề", async () => {
    const onRemove = vi.fn();
    render(
      <Disclosure title="Dòng 1" meta={<span>3 ô đã đổi</span>} actions={<button type="button" onClick={onRemove}>Bỏ dòng</button>}>
        nội dung
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: /Dòng 1/ });
    expect(toggle).toHaveTextContent("3 ô đã đổi");
    await userEvent.click(screen.getByRole("button", { name: "Bỏ dòng" }));
    expect(onRemove).toHaveBeenCalled();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
