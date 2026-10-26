// @vitest-environment jsdom
// Nút "Chỉ vị trí … trên file" chỉ hiện khi file gốc có lớp chữ (onPick); bấm → báo trường cần chỉ.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import type { ExtractedField } from "@/mocks/types";
import { FieldRow } from "./field-row";

const FIELD = { id: "fld_1", documentId: "doc_1", group: "GENERAL", key: "invoice_no", label: "Số hóa đơn", value: "INV-1", originalValue: "INV-1", status: "SINGLE_SOURCE" } as ExtractedField;
const noop = () => {};

describe("FieldRow – chỉ trên file", () => {
  it("có onPick → nút chỉ trên file, bấm gọi onPick(id), aria-pressed theo picking; không vi phạm a11y", async () => {
    const onPick = vi.fn();
    const { container, unmount } = renderWithProviders(<FieldRow field={FIELD} active={false} onActivate={noop} onSave={noop} onConfirm={noop} onRevert={noop} onPick={onPick} />);
    const btn = screen.getByRole("button", { name: "Chỉ vị trí Số hóa đơn trên file" });
    await userEvent.click(btn);
    expect(onPick).toHaveBeenCalledWith("fld_1");
    await expectNoA11yViolations(container);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    unmount();
    renderWithProviders(<FieldRow field={FIELD} active={false} onActivate={noop} onSave={noop} onConfirm={noop} onRevert={noop} onPick={onPick} picking />);
    expect(screen.getByRole("button", { name: "Chỉ vị trí Số hóa đơn trên file" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("không có onPick (scan/ảnh, bản mock) → không có nút", () => {
    renderWithProviders(<FieldRow field={FIELD} active={false} onActivate={noop} onSave={noop} onConfirm={noop} onRevert={noop} />);
    expect(screen.queryByRole("button", { name: /trên file/ })).toBeNull();
  });
});
