// @vitest-environment jsdom
// Hộp sau khi lưu bằng Enter: Thoát panel (mặc định – Enter lần nữa là thoát) · Ở lại.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { SavedDialog } from "./saved-dialog";

const props = () => ({ title: "2.12 · Tên người xuất khẩu", onExit: vi.fn(), onStay: vi.fn(), onClosed: vi.fn() });

describe("SavedDialog", () => {
  it("nút Thoát panel được focus sẵn: Enter là thoát", async () => {
    const p = props();
    const { container } = renderWithProviders(<SavedDialog open {...p} />);
    expect(screen.getByText("Đã lưu 2.12 · Tên người xuất khẩu")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Thoát panel" }));
    await userEvent.keyboard("{Enter}");
    expect(p.onExit).toHaveBeenCalled();
    await expectNoA11yViolations(container.ownerDocument.body);
  });

  it("Ở lại / Esc → ở lại panel", async () => {
    const p = props();
    renderWithProviders(<SavedDialog open {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Ở lại" }));
    expect(p.onStay).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(p.onStay).toHaveBeenCalledTimes(2);
    expect(p.onExit).not.toHaveBeenCalled();
  });
});
