// @vitest-environment jsdom
// Hộp hỏi khi panel sửa ô còn thay đổi chưa lưu: chuyển ô (Lưu · Giữ giá trị cũ · Ở lại) và bấm ra ngoài panel (Lưu · Giữ giá trị cũ).
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { UnsavedDialog } from "./unsaved-dialog";

const props = () => ({ title: "1.44 · Tổng trị giá hóa đơn", count: 1, saving: false, onSave: vi.fn(), onDiscard: vi.fn(), onStay: vi.fn(), onClosed: vi.fn() });

describe("UnsavedDialog", () => {
  it("chuyển ô: có Lưu, Giữ giá trị cũ, Ở lại", async () => {
    const p = props();
    const { container } = renderWithProviders(<UnsavedDialog open {...p} />);
    expect(screen.getByText(/Rời ô này mà không lưu/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Ở lại" }));
    expect(p.onStay).toHaveBeenCalled();
    await expectNoA11yViolations(container.ownerDocument.body);
  });

  it("bấm ra ngoài panel: hỏi giá trị đã thay đổi, chỉ Lưu và Giữ giá trị cũ", async () => {
    const p = props();
    renderWithProviders(<UnsavedDialog open leaving {...p} />);
    expect(screen.getByText("Giá trị đã thay đổi (1 chỉ tiêu). Bạn muốn lưu không?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ở lại" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Giữ giá trị cũ" }));
    expect(p.onDiscard).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(p.onSave).toHaveBeenCalled();
  });
});
