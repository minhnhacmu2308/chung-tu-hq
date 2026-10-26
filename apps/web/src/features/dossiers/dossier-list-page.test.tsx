// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
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
/**
 * Mở menu "…" của hồ sơ (bấm `expected` nếu `click`); quyền xóa theo phiên đăng nhập + danh sách thành viên tải bất đồng bộ (menu có
 * thể đóng khi bảng dựng lại) → mở lại tới khi được.
 */
async function openMenu(table: HTMLElement, code: string, expected: RegExp, click = false) {
  await waitFor(async () => {
    if (screen.queryByRole("menu")) await userEvent.keyboard("{Escape}");
    await userEvent.click(await within(table).findByRole("button", { name: `Thao tác khác – ${code}` }));
    const item = await screen.findByRole("menuitem", { name: expected });
    if (click) await userEvent.click(item);
  }, T);
}
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

  it("xóa hẳn hồ sơ chưa truyền (hỏi xác nhận); hồ sơ đã truyền không có nút xóa; Người khai không thấy nút xóa", async () => {
    const db = getDb();
    db.currentUserId = db.members.find((m) => m.role === "ADMIN")!.id;
    const sent = (d: (typeof db.dossiers)[number]) => d.status === "SUBMITTED" || d.status === "CLEARED" || !!d.declarationNo || !!db.customsFlows[d.id];
    const target = db.dossiers.find((d) => !sent(d))!;
    const locked = db.dossiers.find(sent)!;
    renderWithProviders(<DossierListPage />);
    const table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await userEvent.type(screen.getByRole("searchbox"), target.code);
    await openMenu(table, target.code, /^Xóa hồ sơ/, true);
    const dialog = await screen.findByRole("dialog", { name: "Xóa hẳn hồ sơ?" }, T);
    expect(within(dialog).getByText(new RegExp(target.code))).toBeTruthy();
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Xóa vĩnh viễn" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T);
    expect(getDb().dossiers.some((d) => d.id === target.id)).toBe(false);

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), locked.code);
    await openMenu(table, locked.code, /^Hủy hồ sơ/);
    expect(screen.queryByRole("menuitem", { name: /^Xóa hồ sơ/ })).toBeNull();
  }, 40_000);

  it("Người khai (DECLARANT) không thấy nút xóa hồ sơ", async () => {
    const db = getDb();
    db.currentUserId = db.members.find((m) => m.role === "DECLARANT")!.id;
    const code = db.dossiers[0]!.code;
    renderWithProviders(<DossierListPage />);
    const table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await openMenu(table, code, /^Mở hồ sơ/);
    expect(screen.queryByRole("menuitem", { name: /^Xóa hồ sơ/ })).toBeNull();
  }, 30_000);
});
