// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { MailboxSection } from "./mailbox-section";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => search,
}));

const T = { timeout: 5000 };

beforeEach(() => {
  resetDb();
  search = new URLSearchParams("tab=integrations");
});

describe("Tài khoản & tích hợp → Hộp thư chứng từ", () => {
  it("hiện hộp thư đã kết nối, trạng thái, người kết nối và các thao tác; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<MailboxSection />);
    const list = await screen.findByRole("list", { name: "Hộp thư đã kết nối" }, T);
    expect(within(list).getByText("chungtu.anphat@gmail.com")).toBeTruthy();
    expect(within(list).getByText("Đang kết nối")).toBeTruthy();
    expect(within(list).getByText(/Kết nối bởi Nguyễn Thu Hà/)).toBeTruthy();
    expect(await within(list).findByRole("button", { name: "Lấy thư" }, T)).toBeTruthy();
    // Quản trị viên gỡ được kết nối của người khác.
    expect(within(list).getByRole("button", { name: "Gỡ kết nối" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kết nối Gmail" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kết nối Outlook" })).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 20_000);

  it("hộp thư bị thu hồi quyền → báo lý do đã dịch và nút Kết nối lại", async () => {
    Object.assign(getDb().mailConnections[0]!, { status: "REAUTH", lastError: "MAILBOX_REAUTH_REQUIRED" });
    renderWithProviders(<MailboxSection />);
    expect(await screen.findByText("Hộp thư chungtu.anphat@gmail.com đã thu hồi quyền hoặc hết hạn – hãy kết nối lại", undefined, T)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Kết nối lại" }, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lấy thư" })).toBeNull();
  }, 20_000);

  it("gỡ kết nối qua hộp xác nhận", async () => {
    renderWithProviders(<MailboxSection />);
    const list = await screen.findByRole("list", { name: "Hộp thư đã kết nối" }, T);
    await userEvent.click(await within(list).findByRole("button", { name: "Gỡ kết nối" }, T));
    const dialog = await screen.findByRole("dialog", { name: "Gỡ kết nối hộp thư" });
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Gỡ kết nối" }));
    expect(await screen.findByText("Chưa kết nối hộp thư nào", undefined, T)).toBeTruthy();
    expect(getDb().mailConnections).toHaveLength(0);
  }, 20_000);

  it("bộ lọc: lưu người gửi + chỉ từ khóa riêng + loại file, hiện tóm tắt; nhập sai báo lỗi tại ô", async () => {
    renderWithProviders(<MailboxSection />);
    const list = await screen.findByRole("list", { name: "Hộp thư đã kết nối" }, T);
    await userEvent.click(await within(list).findByRole("button", { name: "Bộ lọc" }, T));
    const dialog = await screen.findByRole("dialog", { name: "Bộ lọc email chứng từ" });
    await expectNoA11yViolations(dialog);
    const senders = within(dialog).getByRole("textbox", { name: "Chỉ lấy email từ" });
    await userEvent.type(senders, "không hợp lệ");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Chỉ từ khóa của doanh nghiệp/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu bộ lọc" }));

    expect(await within(dialog).findByText(/"không hợp lệ" không phải email hoặc tên miền hợp lệ/)).toBeTruthy();
    expect(within(dialog).getByText("Nhập ít nhất một từ khóa, hoặc chọn kiểu lọc khác.")).toBeTruthy();

    await userEvent.clear(senders);
    await userEvent.type(senders, "ops@saovietlogistics.vn{enter}@hansol.co.kr");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Từ khóa của doanh nghiệp/ }), "PO");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "ZIP" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu bộ lọc" }));
    expect(await within(list).findByText("Bộ lọc: 2 người gửi · 1 từ khóa riêng · PDF, PNG, JPG, JPEG", undefined, T)).toBeTruthy();
    expect(getDb().mailConnections[0]!.filters).toMatchObject({ senders: ["ops@saovietlogistics.vn", "@hansol.co.kr"], keywordMode: "CUSTOM", keywords: ["PO"], extensions: ["pdf", "png", "jpg", "jpeg"] });
  }, 30_000);

  it("callback OAuth: báo kết quả rồi xóa tham số khỏi URL", async () => {
    search = new URLSearchParams("tab=integrations&mailbox=error&reason=MAILBOX_STATE_INVALID");
    renderWithProviders(<MailboxSection />);
    expect(await screen.findByText("Phiên kết nối hộp thư đã hết hạn, hãy bấm kết nối lại", undefined, T)).toBeTruthy();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/settings?tab=integrations");
  }, 20_000);

  it("Người xem không kết nối / lấy thư được", async () => {
    getDb().currentUserId = getDb().members.find((m) => m.role === "VIEWER")!.id;
    renderWithProviders(<MailboxSection />);
    expect(await screen.findByText("Người xem không kết nối được hộp thư.", undefined, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kết nối Gmail" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lấy thư" })).toBeNull();
  }, 20_000);
});
