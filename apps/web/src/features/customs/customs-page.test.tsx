// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { CustomsPage } from "./customs-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/customs",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 5000 };

beforeEach(() => {
  resetDb();
  window.localStorage.removeItem("kb-table-view:customs");
  push.mockReset();
});

describe("Khai báo Hải quan", () => {
  it("bảng tờ khai: loại hình NK/XK, mã nghiệp vụ mở được tên đầy đủ, thao tác trên dòng; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<CustomsPage />);
    const table = await screen.findByRole("table", { name: "Tờ khai Hải quan" }, T);
    const row = (await within(table).findByText("HS-NK-2610-019", {}, T)).closest("tr")!;
    expect(within(row).getByText("NK")).toBeTruthy();
    // Không còn khung Card bọc bảng.
    expect(table.closest("[data-slot=card]")).toBeNull();

    await userEvent.click(within(row).getByRole("button", { name: /IID/ }));
    expect(await screen.findByText("Tra cứu trạng thái tờ khai", { selector: "[role=dialog] *, [data-radix-popper-content-wrapper] *" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(within(row).getByRole("button", { name: "Thao tác khác – HS-NK-2610-019" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Mở hồ sơ/ }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/dossiers\/[^?]+$/));
    await expectNoA11yViolations(container);
  }, 20_000);

  it("dạng thẻ: mỗi tờ khai một thẻ có trạng thái, phân luồng, số tờ khai; nhớ lựa chọn", async () => {
    renderWithProviders(<CustomsPage />);
    const table = await screen.findByRole("table", { name: "Tờ khai Hải quan" }, T);
    await within(table).findByText("HS-NK-2610-019", {}, T);
    await userEvent.click(screen.getByRole("radio", { name: /Thẻ/ }));
    const cards = document.querySelectorAll("[data-slot=record-card]");
    expect(cards.length).toBeGreaterThan(0);
    const card = [...cards].find((c) => c.textContent?.includes("HS-NK-2610-019")) as HTMLElement;
    expect(within(card).getByText("Luồng vàng")).toBeTruthy();
    expect(within(card).getByText("107624410320")).toBeTruthy();
    expect(window.localStorage.getItem("kb-table-view:customs")).toBe("cards");
  }, 20_000);
});

describe("Khai báo Hải quan – lô nhiều tờ khai", () => {
  it("mỗi tờ một dòng, cột Tờ ghi \"2/3\"; a11y", async () => {
    const code = getDb().dossiers.find((d) => d.id === "dos_028")!.code;
    const { container } = renderWithProviders(<CustomsPage />);
    const table = await screen.findByRole("table", { name: "Tờ khai Hải quan" }, T);
    await userEvent.type(screen.getByRole("searchbox"), code);
    const rows = (await within(table).findAllByText(code, {}, T)).map((el) => el.closest("tr")!);
    expect(rows).toHaveLength(3);
    expect(within(table).getAllByRole("columnheader").some((h) => h.textContent?.trim() === "Tờ")).toBe(true);
    expect(rows.map((r) => within(r).getByText(/^\d\/3$/).textContent)).toEqual(["1/3", "2/3", "3/3"]);
    await expectNoA11yViolations(container);
  }, 20_000);
});
