// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { NotificationsPanel, groupByDay } from "./notifications-panel";

// jsdom không điều hướng được: Link giả chặn mặc định sau khi gọi onClick của panel.
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...p }: { href: string; children: ReactNode; onClick?: (e: MouseEvent) => void }) => (
    <a href={href} {...p} onClick={(e) => { onClick?.(e as unknown as MouseEvent); e.preventDefault(); }}>{children}</a>
  ),
}));

// IntersectionObserver giả: test tự "cuộn tới đáy" bằng reach().
let observers: { cb: IntersectionObserverCallback; el?: Element }[] = [];
class FakeIO {
  private entry: { cb: IntersectionObserverCallback; el?: Element };
  constructor(cb: IntersectionObserverCallback) {
    this.entry = { cb };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.el = el;
  }
  disconnect() {
    observers = observers.filter((o) => o !== this.entry);
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}
const reach = () =>
  act(() => {
    for (const o of observers) o.cb([{ isIntersecting: true, target: o.el! } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
  });

const T = { timeout: 5000 };
const UNREAD = () => getDb().notifications.filter((n) => !n.read).length;
const items = () => screen.queryAllByRole("listitem");

beforeEach(() => {
  resetDb();
  observers = [];
  globalThis.IntersectionObserver = FakeIO as unknown as typeof IntersectionObserver;
  window.localStorage.removeItem("kb-notifications-status");
});

describe("groupByDay", () => {
  it("Hôm nay / Hôm qua / Trước đó theo nửa đêm giờ máy, giữ thứ tự", () => {
    const now = new Date(2026, 10, 16, 9, 0);
    const at = (d: number, h: number) => new Date(2026, 10, d, h).toISOString();
    const g = groupByDay([{ at: at(16, 8) }, { at: at(16, 0) }, { at: at(15, 23) }, { at: at(15, 0) }, { at: at(14, 23) }], now);
    expect(g.map((x) => [x.key, x.items.length])).toEqual([["today", 2], ["yesterday", 2], ["earlier", 1]]);
  });
});

describe("Panel thông báo", () => {
  it("trang đầu 20 mục, nhóm theo ngày, tab Chưa đọc có số; cuộn tới đáy tải thêm tới hết; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<NotificationsPanel onNavigate={() => {}} />);
    await waitFor(() => expect(items()).toHaveLength(20), T);
    expect(screen.getByRole("region", { name: "Hôm nay" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: `Chưa đọc (${UNREAD()})` })).toBeTruthy();
    await expectNoA11yViolations(container);

    await reach();
    await waitFor(() => expect(items()).toHaveLength(40), T);
    await reach();
    await waitFor(() => expect(items()).toHaveLength(60), T);
    await reach();
    await waitFor(() => expect(items()).toHaveLength(64), T);
    expect(screen.getByText("Đã hết thông báo")).toBeTruthy();
  });

  it("lọc Chưa đọc (nhớ lựa chọn), theo nhóm và từ khóa; không có kết quả → Xóa bộ lọc", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsPanel onNavigate={() => {}} />);
    await waitFor(() => expect(items()).toHaveLength(20), T);

    await user.click(screen.getByRole("radio", { name: /^Chưa đọc/ }));
    await waitFor(() => expect(items()).toHaveLength(UNREAD()), T);
    expect(screen.getAllByRole("link").every((a) => a.textContent?.includes("(Chưa đọc)"))).toBe(true);
    expect(window.localStorage.getItem("kb-notifications-status")).toBe("unread");
    await user.click(screen.getByRole("radio", { name: "Tất cả" }));

    await user.type(screen.getByRole("searchbox", { name: "Tìm thông báo" }), "thông quan");
    await waitFor(() => expect(screen.getAllByRole("link").every((a) => /thông quan/i.test(a.closest("li")!.textContent!))).toBe(true), T);

    await user.clear(screen.getByRole("searchbox", { name: "Tìm thông báo" }));
    await user.type(screen.getByRole("searchbox", { name: "Tìm thông báo" }), "khong-co-dau-ca");
    await screen.findByText("Không có thông báo phù hợp", undefined, T);
    await user.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(items()).toHaveLength(20), T);
  });

  it("đánh dấu đã đọc / xóa trên dòng; bấm mục chưa đọc → đã đọc + gọi onNavigate", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<NotificationsPanel onNavigate={onNavigate} />);
    await waitFor(() => expect(items()).toHaveLength(20), T);
    const before = UNREAD();
    const first = items()[0]!;
    const firstId = getDb().notifications[0]!.id;

    await user.click(within(first).getByRole("button", { name: "Đánh dấu đã đọc" }));
    await waitFor(() => expect(UNREAD()).toBe(before - 1), T);
    await screen.findByRole("radio", { name: `Chưa đọc (${before - 1})` }, T);
    await user.click(within(items()[0]!).getByRole("button", { name: "Đánh dấu chưa đọc" }));
    await waitFor(() => expect(UNREAD()).toBe(before), T);

    // Xóa phải hỏi trước: "Giữ lại" không xóa, "Xóa" mới xóa.
    await user.click(within(items()[0]!).getByRole("button", { name: "Xóa thông báo" }));
    await user.click(await screen.findByRole("button", { name: "Giữ lại" }, T));
    expect(getDb().notifications.some((n) => n.id === firstId)).toBe(true);
    await user.click(within(items()[0]!).getByRole("button", { name: "Xóa thông báo" }));
    await user.click(await screen.findByRole("button", { name: "Xóa" }, T));
    await waitFor(() => expect(getDb().notifications.some((n) => n.id === firstId)).toBe(false), T);

    const second = getDb().notifications[0]!;
    expect(second.read).toBe(false);
    await waitFor(() => expect(items()[0]!.textContent).toContain(second.title), T);
    await user.click(within(items()[0]!).getByRole("link"));
    expect(onNavigate).toHaveBeenCalled();
    await waitFor(() => expect(getDb().notifications[0]!.read).toBe(true), T);
  });
});
