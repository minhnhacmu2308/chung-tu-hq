// @vitest-environment jsdom
// Bảng phím tắt của panel sửa ô: đủ các phím, Đóng / Esc đóng, không lỗi a11y.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { ShortcutsDialog } from "./shortcuts-dialog";

describe("ShortcutsDialog", () => {
  it("liệt kê phím tắt; Đóng được focus sẵn", async () => {
    const onClose = vi.fn();
    const { container } = renderWithProviders(<ShortcutsDialog open onClose={onClose} />);
    for (const k of ["Enter", "Ctrl+S · Ctrl+Enter", "Tab", "Shift+Tab", "Esc", "F1"]) expect(screen.getByText(k)).toBeTruthy();
    expect(screen.getByText(/lỡ bấm Tab thì bấm lại/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getAllByRole("button", { name: "Đóng" }).at(-1));
    await expectNoA11yViolations(container.ownerDocument.body);
    await userEvent.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
