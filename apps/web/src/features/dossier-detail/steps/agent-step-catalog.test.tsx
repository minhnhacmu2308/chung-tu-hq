// @vitest-environment jsdom
// Bảng "Xác nhận mã HS": dòng hàng trùng tên mặt hàng đã khai trong danh mục → gợi ý mã đã dùng + "Dùng mã này";
// hộp "Chọn mã khác" có mục mã đã khai trong danh mục hàng hóa.
import { itemNameKey } from "@kb/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { AgentStep } from "./agent-step";

// Cả bộ web chạy song song trên máy/CI chậm: hạn rộng, chỉ hết hạn khi thật sự hỏng.
const T = { timeout: 20_000 };

/** Chọn dòng 1 + 2: ô chọn có thể bị dựng lại khi gợi ý danh mục (resolve-many) về → lấy lại ô ngay trước khi bấm, lặp đến khi cả hai đã chọn. */
async function pickLines(): Promise<void> {
  await waitFor(async () => {
    for (const name of ["Chọn dòng Dòng 1", "Chọn dòng Dòng 2"]) {
      const box = screen.getByRole("checkbox", { name }) as HTMLInputElement;
      if (box.getAttribute("aria-checked") !== "true" && !box.checked) await userEvent.click(box);
    }
    for (const name of ["Chọn dòng Dòng 1", "Chọn dòng Dòng 2"]) {
      const box = screen.getByRole("checkbox", { name }) as HTMLInputElement;
      expect(box.getAttribute("aria-checked") === "true" || box.checked).toBe(true);
    }
  }, T);
}

function setup() {
  resetDb();
  const db = getDb();
  const run = db.agentRuns[0]!;
  const dossier = db.dossiers.find((d) => d.id === run.dossierId)!;
  dossier.status = "NEEDS_REVIEW";
  const line = db.lineItems.find((i) => i.dossierId === dossier.id && i.lineNo === 1)!;
  delete line.hsConfirmed;
  const now = new Date().toISOString();
  const name = `  ${line.description.toUpperCase()} `;
  db.catalog.items.push({
    ...db.catalog.items[0]!, id: "cat_test", itemNo: "MH-999999", name, nameKey: itemNameKey(name), hsCode: "94051199", timesDeclared: 12, createdAt: now, updatedAt: now,
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
  }, 60_000);

  it("Chọn mã khác: mục 'Mã đã khai trong danh mục hàng hóa' chọn được và xác nhận", async () => {
    const { dossier, line } = setup();
    renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    await screen.findByText("Đã khai trước: 9405.11.99 · 12 lần", undefined, T);
    const pickButtons = screen.getAllByRole("button", { name: "Chọn mã khác" });
    await userEvent.click(pickButtons[0]!);
    const dialog = await screen.findByRole("dialog", undefined, T);
    // Gợi ý theo dòng tra danh mục ở server (resolve-many) – tải bất đồng bộ khi mở hộp.
    const group = await within(dialog).findByRole("radiogroup", { name: /Mã đã khai trong danh mục hàng hóa/ }, T);
    await userEvent.click(within(group).getByRole("radio", { name: /9405\.11\.99/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận mã này" }));
    await waitFor(() => expect(getDb().lineItems.find((i) => i.id === line.id)!.hsConfirmed).toBe("9405.11.99"), T);
  }, 60_000);

  it("chọn nhiều dòng → 'Bỏ xác nhận n dòng' rồi 'Xác nhận n mã gợi ý' hàng loạt; nút trên dòng là icon có tên đọc được", async () => {
    resetDb();
    const db = getDb();
    const run = db.agentRuns[0]!;
    const dossier = db.dossiers.find((d) => d.id === run.dossierId)!;
    dossier.status = "NEEDS_REVIEW";
    const lines = db.lineItems.filter((i) => i.dossierId === dossier.id).sort((a, b) => a.lineNo - b.lineNo).slice(0, 2);
    for (const l of lines) l.hsConfirmed = l.hsSuggested!;
    renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    const table = await screen.findByRole("table", { name: "Xác nhận mã HS từng dòng hàng" }, T);
    expect(within(table).getByRole("button", { name: "Đổi mã HS dòng 1" }).textContent).toBe("");
    await pickLines();
    await userEvent.click(await screen.findByRole("button", { name: "Bỏ xác nhận 2 dòng" }, T));
    await waitFor(() => expect(lines.map((l) => getDb().lineItems.find((i) => i.id === l.id)!.hsConfirmed ?? null)).toEqual([null, null]), T);
    // Bảng đã tải lại (dòng 1 về chưa xác nhận) và thanh chọn đã đóng.
    await waitFor(() => expect(within(table).queryByRole("button", { name: "Đổi mã HS dòng 1" })).toBeNull(), T);
    await waitFor(() => expect(document.querySelector("[data-slot=selection-bar]")).toBeNull(), T);
    await pickLines();
    await userEvent.click(await screen.findByRole("button", { name: "Xác nhận 2 mã gợi ý" }, T));
    await waitFor(() => expect(lines.map((l) => getDb().lineItems.find((i) => i.id === l.id)!.hsConfirmed)).toEqual(lines.map((l) => l.hsSuggested)), T);
  }, 60_000);
});
