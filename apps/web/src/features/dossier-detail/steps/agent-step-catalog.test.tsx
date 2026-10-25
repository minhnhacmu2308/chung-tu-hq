// @vitest-environment jsdom
// Bảng "Xác nhận mã HS": dòng hàng trùng tên mặt hàng đã khai trong danh mục → gợi ý mã đã dùng + "Dùng mã này";
// hộp "Chọn mã khác" có mục mã đã khai trong danh mục hàng hóa.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { AgentStep } from "./agent-step";

const T = { timeout: 8000 };

function setup() {
  resetDb();
  const db = getDb();
  const run = db.agentRuns[0]!;
  const dossier = db.dossiers.find((d) => d.id === run.dossierId)!;
  dossier.status = "NEEDS_REVIEW";
  const line = db.lineItems.find((i) => i.dossierId === dossier.id && i.lineNo === 1)!;
  delete line.hsConfirmed;
  const now = new Date().toISOString();
  db.products.push({
    ...db.products[0]!, id: "prd_test", code: null, name: `  ${line.description.toUpperCase()} `, hsCode: "94051199", timesDeclared: 12, createdAt: now, updatedAt: now,
  });
  return { dossier, line };
}

describe("AgentStep – mã HS từ danh mục hàng hóa", () => {
  beforeEach(() => vi.useRealTimers());

  it("dòng trùng tên mặt hàng đã khai → 'Đã khai trước' + Dùng mã này xác nhận đúng mã đó; không vi phạm a11y", async () => {
    const { dossier, line } = setup();
    const { container } = renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    expect(await screen.findByText("Đã khai trước: 9405.11.99 · 12 lần", undefined, T)).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Dùng mã 9405.11.99 đã khai cho dòng 1" }));
    await waitFor(() => expect(getDb().lineItems.find((i) => i.id === line.id)!.hsConfirmed).toBe("9405.11.99"), T);
  }, 30_000);

  it("Chọn mã khác: mục 'Mã đã khai trong danh mục hàng hóa' chọn được và xác nhận", async () => {
    const { dossier, line } = setup();
    renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    await screen.findByText("Đã khai trước: 9405.11.99 · 12 lần", undefined, T);
    const pickButtons = screen.getAllByRole("button", { name: "Chọn mã khác" });
    await userEvent.click(pickButtons[0]!);
    const dialog = await screen.findByRole("dialog", undefined, T);
    const group = within(dialog).getByRole("radiogroup", { name: /Mã đã khai trong danh mục hàng hóa/ });
    await userEvent.click(within(group).getByRole("radio", { name: /9405\.11\.99/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận mã này" }));
    await waitFor(() => expect(getDb().lineItems.find((i) => i.id === line.id)!.hsConfirmed).toBe("9405.11.99"), T);
  }, 30_000);
});
