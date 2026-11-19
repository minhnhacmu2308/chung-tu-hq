import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Keyboard } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { HelpPopover, ShortcutList } from "./help-popover.js";
import { UiLocaleProvider } from "../lib/i18n.js";

describe("HelpPopover – nút ? mở hướng dẫn tĩnh", () => {
  it("nút icon có tên mặc định 'Hướng dẫn'; bấm mở khung có tiêu đề + nội dung, Esc đóng", async () => {
    render(<HelpPopover title="Sửa tờ khai nháp">Bấm vào ô để sửa.</HelpPopover>);
    const btn = screen.getByRole("button", { name: "Hướng dẫn" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(btn);
    const dlg = screen.getByRole("dialog", { name: "Hướng dẫn" });
    expect(dlg).toHaveTextContent("Sửa tờ khai nháp");
    expect(dlg).toHaveTextContent("Bấm vào ô để sửa.");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Enter trên nút mở; nút ✕ đóng", async () => {
    render(<HelpPopover label="Phím tắt" icon={<Keyboard aria-hidden="true" />}>Nội dung</HelpPopover>);
    screen.getByRole("button", { name: "Phím tắt" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Phím tắt" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("điều khiển từ ngoài: open + onOpenChange", async () => {
    const onOpenChange = vi.fn();
    render(<HelpPopover open onOpenChange={onOpenChange}>Mở sẵn</HelpPopover>);
    expect(screen.getByRole("dialog")).toHaveTextContent("Mở sẵn");
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("nhãn mặc định theo ngôn ngữ (en / zh)", () => {
    const { unmount } = render(<UiLocaleProvider locale="en"><HelpPopover>x</HelpPopover></UiLocaleProvider>);
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    unmount();
    render(<UiLocaleProvider locale="zh"><HelpPopover>x</HelpPopover></UiLocaleProvider>);
    expect(screen.getByRole("button", { name: "帮助" })).toBeInTheDocument();
  });

  it("không vi phạm a11y (đóng và mở, kèm bảng phím tắt)", async () => {
    const { container } = render(
      <HelpPopover label="Phím tắt">
        <ShortcutList items={[{ keys: ["Ctrl", "V"], label: "Dán" }, { keys: ["F2"], label: "Sửa giá trị đang có" }]} />
      </HelpPopover>,
    );
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Phím tắt" }));
    await expectNoA11yViolations(document.body);
  });
});

describe("ShortcutList – bảng phím tắt", () => {
  it("mỗi tổ hợp là một cặp dt/dd, mỗi phím một kbd", () => {
    const { container } = render(<ShortcutList items={[{ keys: ["Ctrl", "V"], label: "Dán" }, { keys: ["Delete"], label: "Xóa ô" }]} />);
    expect(container.querySelectorAll("dt")).toHaveLength(2);
    expect(container.querySelectorAll("dd")[1]).toHaveTextContent("Xóa ô");
    expect([...container.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["Ctrl", "V", "Delete"]);
  });
});
