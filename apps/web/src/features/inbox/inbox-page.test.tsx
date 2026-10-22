// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { InboxPage } from "./inbox-page";

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inbox",
  useSearchParams: () => search,
}));

const T = { timeout: 5000 };
const rowOf = (table: HTMLElement, text: RegExp) => within(table).getByText(text).closest("tr")!;
const bodyRows = (table: HTMLElement) => [...table.querySelectorAll("tbody tr")].filter((r) => r.querySelector("td")?.getAttribute("colspan") == null);
const actAsRole = (role: string) => {
  const m = getDb().members.find((x) => x.role === role);
  if (m) getDb().currentUserId = m.id;
};

beforeEach(() => {
  resetDb();
  window.localStorage.removeItem("kb-table-view:inbox");
  search = new URLSearchParams();
  push.mockReset();
  replace.mockReset();
});

describe("Hộp thư chứng từ", () => {
  it("bảng email mới: cột người gửi / tiêu đề / file / gợi ý, phân trang; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<InboxPage />);
    const table = await screen.findByRole("table", { name: "Danh sách email chứng từ" }, T);
    expect(screen.getByRole("tab", { name: "Mới (4)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Đã xếp (1)" })).toBeTruthy();
    for (const h of ["Nhận lúc", "Người gửi", "Tiêu đề", "File đính kèm", "Gợi ý hồ sơ"]) expect(within(table).getByRole("columnheader", { name: new RegExp(h) })).toBeTruthy();
    expect(bodyRows(table)).toHaveLength(4);
    expect(within(table).getByText("Trùng mã hồ sơ")).toBeTruthy();
    expect(within(table).getByText("Trùng số vận đơn")).toBeTruthy();
    expect(within(table).getByText("Cùng đối tác")).toBeTruthy();
    expect(within(table).getAllByText("3 file").length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  }, 20_000);

  it("bấm dòng → chi tiết email: người gửi, hộp thư, file; Thêm vào hồ sơ này → file vào hồ sơ gợi ý, email rời mục Mới", async () => {
    renderWithProviders(<InboxPage />);
    const table = await screen.findByRole("table", { name: "Danh sách email chứng từ" }, T);
    await userEvent.click(rowOf(table, /Dongguan Changli/));
    const dialog = await screen.findByRole("dialog", { name: /Dongguan Changli/ }, T);
    expect(within(dialog).getByText("ops@saovietlogistics.vn", { exact: false })).toBeTruthy();
    expect(within(dialog).getByText("chungtu.anphat@gmail.com")).toBeTruthy();
    expect(within(dialog).getByText("HBL_OOLU2741199012.pdf")).toBeTruthy();
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Thêm vào hồ sơ này" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Mới (3)" })).toBeTruthy(), T);
    expect(getDb().documents.filter((d) => d.dossierId === "dos_027").map((d) => d.fileName)).toContain("HBL_OOLU2741199012.pdf");
    expect(getDb().inboxMessages.find((m) => m.id === "imsg_seed_1")?.status).toBe("DONE");
  }, 20_000);

  it("dạng thẻ: mỗi email một thẻ (tiêu đề, người gửi, file, gợi ý); nút thêm nhanh vào hồ sơ gợi ý; nhớ lựa chọn; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<InboxPage />);
    await screen.findByRole("table", { name: "Danh sách email chứng từ" }, T);
    await userEvent.click(screen.getByRole("radio", { name: /Thẻ/ }));
    const list = await screen.findByRole("list", { name: "Danh sách email chứng từ" }, T);
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(window.localStorage.getItem("kb-table-view:inbox")).toBe("cards");
    await expectNoA11yViolations(container);
    const card = within(list).getByText(/Dongguan Changli/).closest("li")!;
    expect(within(card).getByText("Trùng mã hồ sơ")).toBeTruthy();
    await userEvent.click(await within(card).findByRole("button", { name: "Thêm vào hồ sơ HS-NK-2610-027" }, T));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Mới (3)" })).toBeTruthy(), T);
    expect(getDb().inboxMessages.find((m) => m.id === "imsg_seed_1")?.status).toBe("DONE");
  }, 20_000);

  it("Thêm vào hồ sơ… (từ chi tiết): popup chọn sẵn mọi file chờ, chọn hồ sơ rồi thêm; không vi phạm a11y", async () => {
    renderWithProviders(<InboxPage />);
    const table = await screen.findByRole("table", { name: "Danh sách email chứng từ" }, T);
    await userEvent.click(rowOf(table, /Proforma invoice PI-NB-24117/));
    const detail = await screen.findByRole("dialog", { name: /Proforma invoice PI-NB-24117/ }, T);
    expect(within(detail).getByText(/Chưa tìm thấy hồ sơ khớp/)).toBeTruthy();
    await userEvent.click(within(detail).getByRole("button", { name: "Thêm vào hồ sơ…" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm file vào hồ sơ" });
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    // Chưa chọn hồ sơ → báo lỗi, không gửi.
    await userEvent.click(within(dialog).getByRole("button", { name: "Thêm 2 file" }));
    expect(await within(dialog).findByText("Chọn hồ sơ")).toBeTruthy();
    await expectNoA11yViolations(dialog);
  }, 20_000);

  it("tìm trong bảng theo tên file", async () => {
    renderWithProviders(<InboxPage />);
    const table = await screen.findByRole("table", { name: "Danh sách email chứng từ" }, T);
    await userEvent.type(screen.getByRole("searchbox"), "MAWB_618");
    await waitFor(() => expect(bodyRows(table)).toHaveLength(1), T);
    expect(within(table).getByText(/Pre-alert MAWB/)).toBeTruthy();
  }, 20_000);

  it("Người xem: chỉ xem, không có nút xếp file / lấy thư", async () => {
    actAsRole("VIEWER");
    renderWithProviders(<InboxPage />);
    const table = await screen.findByRole("table", { name: "Danh sách email chứng từ" }, T);
    expect(await screen.findByText(/vai trò Người xem/, undefined, T)).toBeTruthy();
    await userEvent.click(rowOf(table, /Dongguan Changli/));
    const dialog = await screen.findByRole("dialog", { name: /Dongguan Changli/ }, T);
    expect(within(dialog).queryByRole("button", { name: "Thêm vào hồ sơ này" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Bỏ qua" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lấy chứng từ mới" })).toBeNull();
  }, 20_000);

  it("chưa kết nối hộp thư và chưa có email → hướng dẫn kết nối", async () => {
    getDb().mailConnections = [];
    getDb().inboxMessages = [];
    renderWithProviders(<InboxPage />);
    expect(await screen.findByText("Chưa kết nối hộp thư", undefined, T)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kết nối hộp thư" }).getAttribute("href")).toBe("/settings?tab=integrations");
  }, 20_000);
});
