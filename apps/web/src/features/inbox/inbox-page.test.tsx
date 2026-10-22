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
const actAsRole = (role: string) => {
  const m = getDb().members.find((x) => x.role === role);
  if (m) getDb().currentUserId = m.id;
};

beforeEach(() => {
  resetDb();
  search = new URLSearchParams();
  push.mockReset();
  replace.mockReset();
});

describe("Hộp thư chứng từ", () => {
  it("liệt kê email mới kèm gợi ý hồ sơ, file đính kèm; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<InboxPage />);
    const list = await screen.findByRole("list", { name: "Danh sách email chứng từ" }, T);
    expect(screen.getByRole("tab", { name: "Mới (4)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Đã xếp (1)" })).toBeTruthy();
    expect(within(list).getByText("Trùng mã hồ sơ")).toBeTruthy();
    expect(within(list).getByText("Trùng số vận đơn")).toBeTruthy();
    expect(within(list).getByText("Cùng đối tác")).toBeTruthy();
    expect(within(list).getByText("HBL_OOLU2741199012.pdf")).toBeTruthy();
    expect(await within(list).findAllByRole("button", { name: "Thêm vào hồ sơ này" }, T)).toHaveLength(3);
    await expectNoA11yViolations(container);
  }, 20_000);

  it("Thêm vào hồ sơ này → file vào hồ sơ gợi ý, email rời mục Mới", async () => {
    renderWithProviders(<InboxPage />);
    const card = await screen.findByRole("region", { name: /Dongguan Changli/ }, T);
    await userEvent.click(await within(card).findByRole("button", { name: "Thêm vào hồ sơ này" }, T));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Mới (3)" })).toBeTruthy(), T);
    expect(getDb().documents.filter((d) => d.dossierId === "dos_027").map((d) => d.fileName)).toContain("HBL_OOLU2741199012.pdf");
    expect(getDb().inboxMessages.find((m) => m.id === "imsg_seed_1")?.status).toBe("DONE");
  }, 20_000);

  it("Thêm vào hồ sơ…: popup chọn sẵn mọi file chờ, chọn hồ sơ rồi thêm; không vi phạm a11y", async () => {
    renderWithProviders(<InboxPage />);
    const card = await screen.findByRole("region", { name: /Proforma invoice PI-NB-24117/ }, T);
    await userEvent.click(await within(card).findByRole("button", { name: "Thêm vào hồ sơ…" }, T));
    const dialog = await screen.findByRole("dialog", { name: "Thêm file vào hồ sơ" });
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    // Chưa chọn hồ sơ → báo lỗi, không gửi.
    await userEvent.click(within(dialog).getByRole("button", { name: "Thêm 2 file" }));
    expect(await within(dialog).findByText("Chọn hồ sơ")).toBeTruthy();
    await expectNoA11yViolations(dialog);
  }, 20_000);

  it("Người xem: chỉ xem, không có nút xếp file / lấy thư", async () => {
    actAsRole("VIEWER");
    renderWithProviders(<InboxPage />);
    await screen.findByRole("list", { name: "Danh sách email chứng từ" }, T);
    expect(await screen.findByText(/vai trò Người xem/, undefined, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thêm vào hồ sơ này" })).toBeNull();
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
