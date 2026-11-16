// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { branchKey, emptyFlow } from "@/mocks/customs-sim";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { DossierListPage } from "./dossier-list-page";

const push = vi.fn();
const replace = vi.fn();
const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers",
  useSearchParams: () => new URLSearchParams(search.value),
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
  search.value = "";
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

/** Dựng 5 hồ sơ ở các tiến độ biết trước, xóa mọi luồng Hải quan còn lại → số đếm và hàng chắc chắn. */
function seedProgress() {
  const db = getDb();
  const ids = db.dossiers.filter((d) => d.status !== "CANCELLED").slice(0, 5).map((d) => d.id);
  const stages = ["PRE_DECLARED", "DECLARED", "DECLARED", "CLEARED", "REJECTED"] as const;
  const base = db.customsResults[0]!;
  db.customsFlows = {};
  db.customsResults = [];
  // Xóa luôn thông điệp mẫu: còn thông điệp mà không còn luồng / kết quả là trạng thái không có thật (hồ sơ mẫu hiện 'chưa khai báo').
  db.customsMessages = [];
  ids.forEach((id, i) => { db.customsFlows[branchKey(id, 1)] = { ...emptyFlow(), stage: stages[i]! }; });
  db.customsResults.push({ ...base, dossierId: ids[1]!, channel: "RED" }, { ...base, dossierId: ids[2]!, channel: "GREEN" });
  return ids.map((id) => db.dossiers.find((d) => d.id === id)!.code);
}
/** Chọn luồng trong ô "Luồng" của hộp phễu (Select tự vẽ: mở rồi bấm lựa chọn). */
async function pickChannel(label: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Luồng" }));
  await userEvent.click(await screen.findByRole("option", { name: label }));
}
const dataRows = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);
const tabCount = (name: RegExp) => within(screen.getByRole("tab", { name })).getByText(/^[0-9]+$/).textContent;

describe("Danh sách hồ sơ – tab việc cần làm và bộ lọc tiến độ", () => {
  it("tab todo / await-official / channelled / attention lọc đúng hồ sơ, số đếm khớp", async () => {
    const [pre, red, green, cleared, rejected] = seedProgress();
    // Việc cần làm viết cứng theo trạng thái hồ sơ (không dùng helper của trang): chưa có tờ nào khai → hồ sơ nháp/đang xử lý/cần kiểm tra/đã duyệt/đã truyền, trừ 5 hồ sơ đã dựng tiến độ; hồ sơ hủy và thông quan không tính.
    const seeded = new Set([pre, red, green, cleared, rejected]);
    const total = getDb().dossiers.filter((d) => !seeded.has(d.code) && ["DRAFT", "PROCESSING", "NEEDS_REVIEW", "APPROVED", "SUBMITTED"].includes(d.status)).length;
    expect(total).toBeGreaterThan(0);
    // await-official
    search.value = "viec=await-official";
    let r = renderWithProviders(<DossierListPage />);
    let table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await waitFor(() => expect(dataRows(table)).toHaveLength(1), T);
    expect(within(dataRows(table)[0]!).getByText(pre!)).toBeTruthy();
    expect(within(dataRows(table)[0]!).getByText("Đã khai tạm")).toBeTruthy();
    expect(tabCount(/Chờ khai chính thức/)).toBe("1");
    expect(tabCount(/Việc cần làm/)).toBe(String(total));
    r.unmount();
    // todo: mọi dòng "Chưa khai báo", không có 5 hồ sơ đã khai
    search.value = "viec=todo";
    r = renderWithProviders(<DossierListPage />);
    table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await waitFor(() => expect(dataRows(table)).toHaveLength(total), T);
    for (const row of dataRows(table)) expect(within(row).getByText("Chưa khai báo")).toBeTruthy();
    for (const c of [pre, red, green, cleared, rejected]) expect(within(table).queryByText(c!)).toBeNull();
    r.unmount();
    // channelled + lọc luồng đỏ
    search.value = "viec=channelled";
    r = renderWithProviders(<DossierListPage />);
    table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await waitFor(() => expect(dataRows(table)).toHaveLength(2), T);
    expect(tabCount(/Đã phân luồng/)).toBe("2");
    replace.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /^Bộ lọc/ })); // bộ lọc nằm trong hộp phễu
    await pickChannel("Luồng đỏ");
    expect(replace).toHaveBeenCalledWith("/dossiers?viec=channelled&luong=RED", { scroll: false });
    r.unmount();
    search.value = "viec=channelled&luong=RED";
    r = renderWithProviders(<DossierListPage />);
    table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await waitFor(() => expect(dataRows(table)).toHaveLength(1), T);
    expect(within(dataRows(table)[0]!).getByText(red!)).toBeTruthy();
    expect(within(dataRows(table)[0]!).getByText("Luồng đỏ")).toBeTruthy();
    r.unmount();
    // attention: tờ bị từ chối
    search.value = "viec=attention";
    r = renderWithProviders(<DossierListPage />);
    table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await waitFor(() => expect(dataRows(table)).toHaveLength(1), T);
    expect(within(dataRows(table)[0]!).getByText(rejected!)).toBeTruthy();
    expect(tabCount(/Cần chú ý/)).toBe("1");
  }, 60_000);

  it("?viec=channelled&luong=RED chỉ hiện hồ sơ luồng đỏ, ô Luồng đỏ được chọn; đổi tab bỏ luong", async () => {
    const [, red] = seedProgress();
    search.value = "viec=channelled&luong=RED";
    renderWithProviders(<DossierListPage />);
    const table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await waitFor(() => expect(dataRows(table)).toHaveLength(1), T);
    expect(within(dataRows(table)[0]!).getByText(red!)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc (1)" }));
    expect(screen.getByRole("combobox", { name: "Luồng" }).textContent).toContain("Luồng đỏ");
    replace.mockClear();
    await userEvent.click(screen.getByRole("tab", { name: /Đã thông quan/ }));
    expect(replace).toHaveBeenCalledWith("/dossiers?viec=cleared", { scroll: false });
    replace.mockClear();
    if (!screen.queryByRole("combobox", { name: "Luồng" })) await userEvent.click(screen.getByRole("button", { name: /^Bộ lọc/ }));
    await pickChannel("Luồng vàng");
    expect(replace).toHaveBeenCalledWith("/dossiers?viec=channelled&luong=YELLOW", { scroll: false });
  }, 60_000);

  it("lọc cột Trạng thái theo tiến độ chỉ giữ hàng khớp", async () => {
    const [, red, green] = seedProgress();
    renderWithProviders(<DossierListPage />);
    const table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await waitFor(() => expect(dataRows(table).length).toBeGreaterThan(2), T);
    await userEvent.click(screen.getByRole("button", { name: /Lọc|Bộ lọc/ }));
    const select = await screen.findByRole("combobox", { name: /Trạng thái/ }, T);
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: "Đã khai chính thức" }));
    await waitFor(() => expect(dataRows(table)).toHaveLength(2), T);
    expect(within(table).getByText(red!)).toBeTruthy();
    expect(within(table).getByText(green!)).toBeTruthy();
  }, 60_000);
});

describe("Danh sách hồ sơ – tiến độ + tab việc cần làm", () => {
  it("?viec=cleared chỉ hiện hồ sơ đã thông quan; số đếm các tab khớp; bảng có nhãn tiến độ", async () => {
    const db = getDb();
    db.customsFlows = { ...db.customsFlows, [branchKey("dos_028", 1)]: { ...emptyFlow(), stage: "CLEARED" } };
    search.value = "viec=cleared";
    const { container } = renderWithProviders(<DossierListPage />);
    const table = await screen.findByRole("table", { name: "Hồ sơ khai báo" }, T);
    await waitFor(() => expect(within(table).queryAllByText("Đã thông quan").length).toBeGreaterThan(0), T);
    const body = within(table).getAllByRole("row").slice(1);
    for (const r of body) expect(within(r).queryByText(/^Đã thông quan/)).toBeTruthy();
    const tab = screen.getByRole("tab", { name: /Đã thông quan/ });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(within(tab).getByText(String(body.length))).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Việc cần làm/ })).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("lô nhiều tờ: tiến độ theo tờ chậm nhất + cờ \"Bị từ chối\"; không vi phạm a11y", async () => {
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
    expect(within(row).getByText(/^Đã khai tạm/)).toBeTruthy();
    expect(within(row).getByText("Bị từ chối")).toBeTruthy();
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

describe("Danh sách hồ sơ – tab trống", () => {
  it("tab việc cần làm không còn hồ sơ → câu trống của đúng tab (không phải câu của ô tìm kiếm)", async () => {
    const db = getDb();
    db.customsFlows = {};
    db.customsResults = [];
    search.value = "viec=attention";
    renderWithProviders(<DossierListPage />);
    expect(await screen.findByText("Không có hồ sơ cần chú ý", undefined, T)).toBeTruthy();
    expect(screen.getByText("Không có tờ khai nào truyền lỗi hoặc bị Hải quan từ chối.")).toBeTruthy();
    expect(screen.queryByText("Thử từ khóa khác hoặc xóa bộ lọc.")).toBeNull();
  }, 30_000);
});
