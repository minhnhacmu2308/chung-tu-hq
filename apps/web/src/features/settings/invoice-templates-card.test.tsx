// @vitest-environment jsdom
// Mẫu in hóa đơn (ADR 0013 mục 3): tạo mẫu – tắt nhóm, đổi nhãn, đổi tiêu đề, xem trước; nhóm bắt buộc không tắt được; a11y.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { SEED_SETS } from "@/mocks/seed/catalog";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { InvoiceTemplatesCard } from "./invoice-templates-card";

const T = { timeout: 20_000 };
beforeEach(() => resetDb());

describe("InvoiceTemplatesCard", () => {
  it("chưa có mẫu → trạng thái trống; tạo mẫu: bật nhóm L/C, đổi nhãn người mua, tiêu đề; lưu thành mặc định", async () => {
    const { container } = renderWithProviders(<InvoiceTemplatesCard />);
    expect(await screen.findByText("Chưa có mẫu – hệ thống dùng mẫu dựng sẵn", {}, T)).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(await screen.findByRole("button", { name: "Tạo mẫu" }, T));
    const dialog = await screen.findByRole("dialog", {}, T);
    await userEvent.type(within(dialog).getByLabelText(/^Tên mẫu/), "Mẫu L/C");
    const buyerSwitch = within(dialog).getByRole("switch", { name: "Hiện Người mua / Người yêu cầu mở L/C" }) as HTMLButtonElement;
    expect(buyerSwitch.disabled).toBe(true);
    await userEvent.click(within(dialog).getByRole("switch", { name: "Hiện Thư tín dụng (số, ngày, ngân hàng)" }));
    await userEvent.type(within(dialog).getByLabelText("Nhãn in của Người mua / Người yêu cầu mở L/C"), "Sold to");
    const title = within(dialog).getByLabelText(/^Tiêu đề chứng từ/);
    await userEvent.clear(title);
    await userEvent.type(title, "invoice");
    expect(within(dialog).getAllByRole("heading", { name: "INVOICE" }).length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Sold to")).toBeTruthy();
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu mẫu" }));
    await waitFor(() => expect(getDb().invoiceTemplates).toHaveLength(1), T);
    const tpl = getDb().invoiceTemplates[0]!;
    expect(tpl).toMatchObject({ name: "Mẫu L/C", isDefault: true, layout: { title: "INVOICE" } });
    expect(tpl.layout.blocks.find((b) => b.key === "LC_REF")?.visible).toBe(true);
    expect(tpl.layout.blocks.find((b) => b.key === "BUYER")?.label).toBe("Sold to");
  }, 90_000);

  it("In mã hàng theo bộ mã: tự động / Kho / Kế toán / mã nối → xem trước đổi cột mã hàng; lưu bộ đã chọn vào mẫu", async () => {
    renderWithProviders(<InvoiceTemplatesCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Tạo mẫu" }, T));
    const dialog = await screen.findByRole("dialog", {}, T);
    await userEvent.type(within(dialog).getByLabelText(/^Tên mẫu/), "Mẫu kế toán");
    // Bật cột Mã hàng (mặc định ẩn) để xem trước có cột mã.
    const partSwitch = within(dialog).getByRole("switch", { name: /^Hiện Mã hàng/ }) as HTMLButtonElement;
    if (partSwitch.getAttribute("aria-checked") !== "true") await userEvent.click(partSwitch);
    // Mặc định tự động: người mua mẫu không có bộ khách hàng → bộ Kế toán; mặt hàng chưa có mã trong bộ → mã nối.
    expect(within(dialog).getByText("VT-0010")).toBeTruthy();
    expect(within(dialog).getByText("MH-000002")).toBeTruthy();
    const pick = async (name: RegExp) => {
      await userEvent.click(within(dialog).getByRole("combobox", { name: "In mã hàng theo bộ mã" }));
      await userEvent.click(await screen.findByRole("option", { name }, T));
    };
    await pick(/^Kho/);
    expect(await within(dialog).findByText("KHO-0010", {}, T)).toBeTruthy();
    expect(within(dialog).queryByText("VT-0010")).toBeNull();
    await pick(/^Mã nối/);
    expect(await within(dialog).findByText("MH-000001", {}, T)).toBeTruthy();
    await pick(/^Kế toán \(MISA\)/);
    expect(await within(dialog).findByText("VT-0010", {}, T)).toBeTruthy();
    expect(within(dialog).queryByText("DB-10")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu mẫu" }));
    await waitFor(() => expect(getDb().invoiceTemplates).toHaveLength(1), T);
    expect(getDb().invoiceTemplates[0]!.layout.itemCodeSet).toEqual({ codeSetId: SEED_SETS.ACC });
  }, 90_000);

  it("tiêu đề Proforma → báo lỗi, không lưu được", async () => {
    renderWithProviders(<InvoiceTemplatesCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Tạo mẫu" }, T));
    const dialog = await screen.findByRole("dialog", {}, T);
    const title = within(dialog).getByLabelText(/^Tiêu đề chứng từ/);
    await userEvent.clear(title);
    await userEvent.type(title, "PROFORMA INVOICE");
    expect(await within(dialog).findByText("Tiêu đề không được trống và không được là Proforma/Provisional")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Lưu mẫu" }) as HTMLButtonElement).disabled).toBe(true);
  }, 60_000);
});
