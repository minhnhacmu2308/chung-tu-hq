// @vitest-environment jsdom
// Nút "Chỉ vị trí … trên file" chỉ hiện khi file gốc có lớp chữ (onPick); bấm → báo trường cần chỉ.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import type { ExtractedField } from "@/mocks/types";
import { FieldRow, isUnknownPayment, ocrRows, paymentHint } from "./field-row";

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

  it("mã AI lệch chữ trên chứng từ → bắt chọn, báo lệch kèm gợi ý; khớp → chọn sẵn", () => {
    const { unmount } = renderWithProviders(<FieldRow field={pay("L/C at sight")} paymentHint={{ aiCode: "TTR", lcNo: null }} active={false} onActivate={noop} onSave={noop} onConfirm={noop} onRevert={noop} />);
    expect(screen.getByRole("combobox", { name: "Mã phương thức thanh toán (1.43 / 2.38)" }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/không khớp nhau \(gợi ý LC\)/)).toBeTruthy();
    unmount();
    renderWithProviders(<FieldRow field={pay("L/C at sight")} paymentHint={{ aiCode: "LC", lcNo: "S700542640040" }} active={false} onActivate={noop} onSave={noop} onConfirm={noop} onRevert={noop} />);
    expect(screen.getByRole("combobox", { name: "Mã phương thức thanh toán (1.43 / 2.38)" }).textContent).toMatch(/^LC – /);
  });
});

describe("FieldRow – ô chỉ đọc", () => {
  const cont = { ...FIELD, id: "fld_c", group: "TRANSPORT", key: "containers", label: "Số container / seal", value: "FBIU5659719 / 34337288", originalValue: "FBIU5659719 / 34337288" } as ExtractedField;

  it("container: ô chỉ đọc, không nút chỉ trên file, gõ không lưu, có chỉ dẫn sửa ở thẻ nhập tay", async () => {
    const onSave = vi.fn();
    const { container } = renderWithProviders(<FieldRow field={cont} manualCard active={false} onActivate={noop} onSave={onSave} onConfirm={noop} onRevert={noop} onPick={noop} />);
    const input = screen.getByRole("textbox", { name: "Số container / seal" });
    expect(input.hasAttribute("readonly")).toBe(true);
    await userEvent.type(input, "X{Enter}");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /trên file/ })).toBeNull();
    expect(screen.getByText(/thẻ nhập tay lô hàng/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("hồ sơ NK (không có thẻ nhập tay): chỉ dẫn sửa ở bước Review tờ khai, không nhắc thẻ nhập tay", async () => {
    const { container } = renderWithProviders(<FieldRow field={cont} active={false} onActivate={noop} onSave={noop} onConfirm={noop} onRevert={noop} />);
    const input = screen.getByRole("textbox", { name: "Số container / seal" });
    expect(input.hasAttribute("disabled")).toBe(true);
    expect(input.getAttribute("aria-describedby")).toBe("field-fld_c-ro");
    expect(screen.getByText(/bước Review tờ khai/)).toBeTruthy();
    expect(screen.queryByText(/thẻ nhập tay/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("ocrRows bỏ dòng mã PTTT (thông tin nằm ở ghi chú dòng thanh toán), giữ dòng khác", () => {
    const rows = [FIELD, { ...FIELD, id: "fld_m", key: "payment_method_code", value: "LC" } as ExtractedField, cont];
    expect(ocrRows(rows).map((f) => f.key)).toEqual(["invoice_no", "containers"]);
  });
});

describe("paymentHint – cùng thứ tự nguồn với máy chủ", () => {
  it("chữ T/T trên invoice, mã AI invoice LC, mã AI hợp đồng KC → lấy mã của invoice (như ocrExitBlockers), bắt chọn", () => {
    const docs = [{ id: "doc_sc", kind: "SALES_CONTRACT" as const }, { id: "doc_inv", kind: "INVOICE" as const }];
    // Dòng hợp đồng đứng trước trong danh sách: web không được lấy theo thứ tự dòng.
    const rows = [
      { ...FIELD, id: "f1", documentId: "doc_sc", key: "payment_method_code", value: "KC" },
      { ...FIELD, id: "f2", documentId: "doc_inv", key: "payment_method_code", value: "LC" },
      { ...FIELD, id: "f3", documentId: "doc_inv", key: "payment_terms", value: "T/T" },
    ] as ExtractedField[];
    const hint = paymentHint(rows, docs);
    expect(hint).toEqual({ aiCode: "LC", lcNo: null });
    // Máy chủ: paymentNeedsChoice("T/T", "LC", null) → chặn (PAYMENT_METHOD_UNKNOWN).
    expect(isUnknownPayment(rows[2]!, hint)).toBe(true);
  });
});
