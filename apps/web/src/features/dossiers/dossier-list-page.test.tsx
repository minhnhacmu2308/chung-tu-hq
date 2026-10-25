// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { branchKey, emptyFlow } from "@/mocks/customs-sim";
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

describe("Danh sách hồ sơ – lô nhiều tờ khai", () => {
  it("nhãn gộp \"Thông quan 1/3\" + cảnh báo tờ bị từ chối; lô 1 tờ giữ nhãn cũ; không vi phạm a11y", async () => {
    const db = getDb();
    db.customsFlows = {
      ...db.customsFlows,
      [branchKey("dos_028", 1)]: { ...emptyFlow(), stage: "CLEARED" },
      [branchKey("dos_028", 2)]: { ...emptyFlow(), stage: "REJECTED" },
      [branchKey("dos_028", 3)]: { ...emptyFlow(), stage: "PRE_DECLARED" },
    };
    const big = db.dossiers.find((d) => d.id === "dos_028")!;
    big.status = "SUBMITTED";
    const { container } = renderWithProviders(<DossierListPage />);
    const table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await userEvent.type(screen.getByRole("searchbox"), big.code);
    const row = (await within(table).findByText(big.code, {}, T)).closest("tr")!;
    expect(within(row).getByText("Thông quan 1/3")).toBeTruthy();
    expect(within(row).getByText("Tờ 2: bị từ chối")).toBeTruthy();
    expect(within(row).queryByText("Đã truyền")).toBeNull();
    await expectNoA11yViolations(container);
  }, 30_000);
});
