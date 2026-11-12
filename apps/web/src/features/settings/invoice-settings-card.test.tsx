// @vitest-environment jsdom
// Cài đặt hóa đơn thương mại: mẫu số (xem trước số đầu tiên, báo lỗi mẫu) + người ký (ADR 0013 mục 3).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { InvoiceSettingsCard } from "./invoice-settings-card";

const T = { timeout: 10_000 };
/** Ô nhập mở khóa khi đã biết vai trò (phiên tải xong). */
const patternInput = async () => {
  const el = (await screen.findByLabelText(/Mẫu số hóa đơn/, {}, T)) as HTMLInputElement;
  await waitFor(() => expect(el.disabled).toBe(false), T);
  return el;
};
beforeEach(() => resetDb());

describe("InvoiceSettingsCard", () => {
  it("đổi mẫu số (tự viết hoa, xem trước số đầu tiên) và người ký; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<InvoiceSettingsCard />);
    const pattern = await patternInput();
    await expectNoA11yViolations(container);
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "kb-{{yyyy}-{{mm}-{{nnnn}");
    expect(await screen.findByText(/Số đầu tiên theo mẫu: KB-\d{4}-\d{2}-0001/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Người ký/), "Lê Minh Châu");
    await userEvent.click(screen.getByRole("button", { name: "Lưu cài đặt hóa đơn" }));
    expect(await screen.findByText("Đã lưu cài đặt hóa đơn", {}, T)).toBeTruthy();
    expect(getDb().org.invoiceSettings).toEqual({ numbering: { pattern: "KB-{YYYY}-{MM}-{NNNN}", reset: "MONTH" }, signatoryName: "Lê Minh Châu", signatoryTitle: null, sellerName: null });
  }, 30_000);

  it("mẫu thiếu số thứ tự → báo lỗi ô, nút lưu khóa", async () => {
    renderWithProviders(<InvoiceSettingsCard />);
    const pattern = await patternInput();
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "INV{{yy}{{mm}");
    expect(await screen.findByText("Mẫu phải có mã số thứ tự {NNN} (3–8 chữ N)")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Lưu cài đặt hóa đơn" }) as HTMLButtonElement).disabled).toBe(true);
  }, 30_000);
});
