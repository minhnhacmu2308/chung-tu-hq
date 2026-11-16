// @vitest-environment jsdom
import type { NotificationEvent } from "@kb/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen } from "@testing-library/react";
import { Toaster } from "@kb/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_SCOPE_KEY } from "./desktop-notifications";
import { STREAM_ERRORS_BEFORE_POLLING, useNotificationStream } from "./use-notification-stream";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Dùng hiện thực http (EventSource) thay cho mock – test đi qua đúng đường của production.
vi.mock("@/api/session", async (orig) => ({ ...(await orig<typeof import("@/api/session")>()), subscribeNotifications: (await import("@/api/http/session")).subscribeNotifications }));

class FakeEventSource {
  static CLOSED = 2;
  static last: FakeEventSource | null = null;
  readyState = 0;
  onmessage: ((m: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, () => void>();
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, fn);
  }
  close() {
    this.closed = true;
  }
  ready() {
    this.readyState = 1;
    this.listeners.get("ready")?.();
  }
  emit(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent<string>);
  }
  fail(closed = false) {
    this.readyState = closed ? 2 : 0;
    this.onerror?.();
  }
}

const shown: { title: string; opts: NotificationOptions; instance: { onclick: (() => void) | null; close: () => void } }[] = [];
class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(title: string, opts: NotificationOptions) {
    shown.push({ title, opts, instance: this });
  }
}

const ev = (over: Partial<NotificationEvent> = {}): NotificationEvent => ({ id: "ntf_1", orgId: "org_a", userId: "usr_1", category: "CUSTOMS", title: "Đã phân luồng xanh", body: "Hồ sơ HS-NK-01", href: "/dossiers/dos_1?step=submit", at: "2026-11-16T03:00:00.000Z", ...over });

let hidden = false;
let focused = true;
function setup() {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
  const hook = renderHook(() => useNotificationStream({ logoSrc: "/api/org/logo?v=1" }), { wrapper });
  return { ...hook, invalidate, es: FakeEventSource.last! };
}

beforeEach(() => {
  shown.length = 0;
  push.mockReset();
  hidden = false;
  focused = true;
  FakeNotification.permission = "granted";
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("Notification", FakeNotification);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  localStorage.removeItem(DESKTOP_SCOPE_KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useNotificationStream", () => {
  it("mở một luồng tới /api/notifications/stream, đóng khi gỡ", () => {
    const { es, unmount } = setup();
    expect(es.url).toBe("/api/notifications/stream");
    unmount();
    expect(es.closed).toBe(true);
  });

  it("có sự kiện → làm mới panel + huy hiệu, hiện toast có nút Mở dẫn tới href", async () => {
    const { es, invalidate } = setup();
    act(() => es.emit(ev()));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["session", "notifications"] });
    expect(await screen.findByText("Đã phân luồng xanh")).toBeTruthy();
    act(() => screen.getByRole("button", { name: "Mở" }).click());
    expect(push).toHaveBeenCalledWith("/dossiers/dos_1?step=submit");
  });

  it("message sai schema bị bỏ qua", () => {
    const { es, invalidate } = setup();
    act(() => es.emit({ id: "x" }));
    act(() => es.emit("not json"));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("trang đang được nhìn → chỉ toast, không thông báo máy tính", () => {
    const { es } = setup();
    act(() => es.emit(ev()));
    expect(shown).toHaveLength(0);
  });

  it("trang bị ẩn + đã cho phép + đúng phạm vi → thông báo máy tính (tag = id, icon = logo), bấm thì về trang", () => {
    const { es } = setup();
    hidden = true;
    act(() => es.emit(ev()));
    expect(shown).toHaveLength(1);
    expect(shown[0]!.title).toBe("Đã phân luồng xanh");
    expect(shown[0]!.opts).toEqual({ body: "Hồ sơ HS-NK-01", tag: "ntf_1", icon: "/api/org/logo?v=1" });
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});
    act(() => shown[0]!.instance.onclick!());
    expect(focus).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/dossiers/dos_1?step=submit");
    expect(shown[0]!.instance.close).toHaveBeenCalled();
  });

  it("mất focus (cửa sổ khác) cũng tính là không nhìn trang", () => {
    const { es } = setup();
    focused = false;
    act(() => es.emit(ev()));
    expect(shown).toHaveLength(1);
  });

  it("phạm vi mặc định chỉ kết quả Hải quan; 'all' báo mọi nhóm; 'off' tắt; chưa cho phép thì không báo", () => {
    const { es } = setup();
    hidden = true;
    act(() => es.emit(ev({ id: "a", category: "DOSSIER" })));
    expect(shown).toHaveLength(0);
    localStorage.setItem(DESKTOP_SCOPE_KEY, "all");
    act(() => es.emit(ev({ id: "b", category: "DOSSIER" })));
    expect(shown.map((s) => s.opts.tag)).toEqual(["b"]);
    localStorage.setItem(DESKTOP_SCOPE_KEY, "off");
    act(() => es.emit(ev({ id: "c" })));
    localStorage.setItem(DESKTOP_SCOPE_KEY, "customs");
    FakeNotification.permission = "denied";
    act(() => es.emit(ev({ id: "d" })));
    expect(shown).toHaveLength(1);
  });

  it(`lỗi ${STREAM_ERRORS_BEFORE_POLLING} lần liên tiếp → chuyển sang poll; nối lại được → thôi poll`, () => {
    const { es, result } = setup();
    act(() => es.ready());
    act(() => es.fail());
    act(() => es.fail());
    expect(result.current.polling).toBe(false);
    act(() => es.fail());
    expect(result.current.polling).toBe(true);
    act(() => es.ready());
    expect(result.current.polling).toBe(false);
  });

  it("trình duyệt bỏ hẳn luồng (401, readyState CLOSED) → poll ngay", () => {
    const { es, result } = setup();
    act(() => es.fail(true));
    expect(result.current.polling).toBe(true);
  });
});
