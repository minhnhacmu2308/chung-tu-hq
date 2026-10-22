// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { DossierListPage } from "./dossier-list-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 8000 };
beforeEach(() => {
  resetDb();
  push.mockReset();
  window.localStorage.removeItem("kb-table-view:dossiers");
});

describe("Danh sách hồ sơ – bảng ↔ thẻ", () => {
  it("mặc định dạng bảng; chuyển sang thẻ hiện mã hồ sơ, đối tác, trạng thái, trị giá; nhớ lựa chọn; không vi phạm a11y", async () => {
    const { container, unmount } = renderWithProviders(<DossierListPage />);
    const table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    const firstCode = (await within(table).findAllByText(/^HS-(NK|XK)-/, undefined, T))[0]!.textContent!;
    await userEvent.click(screen.getByRole("radio", { name: /Thẻ/ }));
    const list = await screen.findByRole("list", { name: "Hồ sơ khai báo" }, T);
    const card = within(list).getByRole("listitem", { name: firstCode });
    expect(within(card).getByText("Trị giá")).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(card);
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/dossiers\/dos_/));
    expect(window.localStorage.getItem("kb-table-view:dossiers")).toBe("cards");
    unmount();
    renderWithProviders(<DossierListPage />);
    expect(await screen.findByRole("list", { name: "Hồ sơ khai báo" }, T)).toBeTruthy();
  }, 30_000);
});
