import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Button } from "./button.js";
import { FloatingActionBar } from "./floating-action-bar.js";

describe("FloatingActionBar", () => {
  it("thanh công cụ nổi gắn vào body: tên vùng, tóm tắt (status), nút bấm được; không in; không vi phạm a11y", async () => {
    const onSave = vi.fn();
    const { container } = render(
      <main>
        <FloatingActionBar label="Thay đổi chưa lưu" summary="3 ô chưa lưu">
          <Button size="sm" variant="secondary">Hủy</Button>
          <Button size="sm" onClick={onSave}>Lưu 3 thay đổi</Button>
        </FloatingActionBar>
      </main>,
    );
    const bar = screen.getByRole("toolbar", { name: "Thay đổi chưa lưu" });
    expect(bar.parentElement).toBe(document.body);
    expect(container.contains(bar)).toBe(false);
    expect(bar.className).toContain("print:hidden");
    expect(screen.getByRole("status")).toHaveTextContent("3 ô chưa lưu");
    await userEvent.click(screen.getByRole("button", { name: "Lưu 3 thay đổi" }));
    expect(onSave).toHaveBeenCalledOnce();
    await expectNoA11yViolations(document.body);
  });

  it("placement top: dưới thanh menu (--kb-shell-top), không chồng thanh dính đáy trang", () => {
    render(<FloatingActionBar label="Thanh" placement="top"><Button size="sm">Lưu</Button></FloatingActionBar>);
    const bar = screen.getByRole("toolbar", { name: "Thanh" });
    expect(bar).toHaveAttribute("data-placement", "top");
    expect(bar.className).toContain("--kb-shell-top");
    expect(bar.className).not.toContain("bottom-6");
  });

  it("không có tóm tắt → chỉ các nút", () => {
    render(<FloatingActionBar label="Thanh"><Button size="sm">Lưu</Button></FloatingActionBar>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Lưu" })).toBeInTheDocument();
  });
});
