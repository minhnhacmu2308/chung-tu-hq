import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./menu.js";

// jsdom thiếu API mà Radix menu dùng
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

function Menu({ onEdit = vi.fn(), onDelete = vi.fn() }) {
  const [showDone, setShowDone] = useState(true);
  const [sort, setSort] = useState("date");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">Thao tác</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Hồ sơ</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onEdit} shortcut="Ctrl+E">Sửa</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={showDone} onCheckedChange={(c) => setShowDone(c === true)}>Hiện đã xong</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
          <DropdownMenuRadioItem value="date">Theo ngày</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="name">Theo tên</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Xuất</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Excel</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={onDelete}>Xoá hồ sơ</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("mở bằng Enter, đi bằng mũi tên, chọn bằng Enter", async () => {
    const onEdit = vi.fn();
    render(<Menu onEdit={onEdit} />);
    screen.getByRole("button", { name: "Thao tác" }).focus();
    await userEvent.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();
    // mở bằng phím → focus mục đầu (Sửa); xuống rồi lên lại, Enter để chọn
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(onEdit).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("mở bằng ArrowDown, Escape đóng và trả focus về nút", async () => {
    render(<Menu />);
    const trigger = screen.getByRole("button", { name: "Thao tác" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("checkbox / radio item phản ánh trạng thái; item danger gọi onSelect", async () => {
    const onDelete = vi.fn();
    render(<Menu onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Thao tác" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Hiện đã xong" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Theo ngày" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("menuitem", { name: "Xoá hồ sơ" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("không vi phạm a11y khi mở", async () => {
    render(<Menu />);
    await userEvent.click(screen.getByRole("button", { name: "Thao tác" }));
    await expectNoA11yViolations(await screen.findByRole("menu"));
  });
});

describe("Popover", () => {
  const ui = (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button">Bộ lọc</button>
      </PopoverTrigger>
      <PopoverContent showClose aria-label="Bộ lọc hồ sơ">
        <p>Nội dung lọc</p>
      </PopoverContent>
    </Popover>
  );

  it("mở bằng click, đóng bằng nút Đóng", async () => {
    render(ui);
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    expect(screen.getByRole("dialog", { name: "Bộ lọc hồ sơ" })).toHaveTextContent("Nội dung lọc");
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape đóng popover", async () => {
    render(ui);
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nhãn nút đóng tiếng Anh", async () => {
    render(<UiLocaleProvider locale="en">{ui}</UiLocaleProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("không vi phạm a11y khi mở", async () => {
    render(ui);
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    await expectNoA11yViolations(screen.getByRole("dialog"));
  });
});
