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

describe("FieldRow – mã phương thức thanh toán", () => {
  const pay = (value: string) => ({ ...FIELD, id: "fld_p", key: "payment_terms", label: "Phương thức thanh toán", value, originalValue: value }) as ExtractedField;

  it("chữ không nhận ra → ô mã trống báo lỗi, chọn KC → lưu kèm chữ gốc; nhận ra (T/T) → chọn sẵn KC, không báo lỗi", async () => {
    const onSave = vi.fn();
    const { container, unmount } = renderWithProviders(<FieldRow field={pay("Payment by crypto")} active={false} onActivate={noop} onSave={onSave} onConfirm={noop} onRevert={noop} />);
    const code = screen.getByRole("combobox", { name: "Mã phương thức thanh toán (1.43 / 2.38)" });
    expect(code.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Không nhận ra mã chuẩn/)).toBeTruthy();
    await userEvent.click(code);
    await userEvent.click(await screen.findByRole("option", { name: /^KC – / }));
    expect(onSave).toHaveBeenCalledWith("fld_p", "KC – Payment by crypto");
    await expectNoA11yViolations(container);
    unmount();
    renderWithProviders(<FieldRow field={pay("T/T 30 days")} active={false} onActivate={noop} onSave={noop} onConfirm={noop} onRevert={noop} />);
    const known = screen.getByRole("combobox", { name: "Mã phương thức thanh toán (1.43 / 2.38)" });
    expect(known.getAttribute("aria-invalid")).not.toBe("true");
    expect(known.textContent).toMatch(/^KC – /);
    expect(screen.queryByText(/Không nhận ra mã chuẩn/)).toBeNull();
  });
});

