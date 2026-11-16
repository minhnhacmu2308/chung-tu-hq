// Thông báo trên máy tính (Notification API của trình duyệt – ADR 0017): chỉ khi trang đang mở ở một tab/cửa sổ nào đó.
// Tùy chọn lưu theo từng trình duyệt (localStorage) vì là thiết lập của máy, không phải của tài khoản.
import type { NotificationCategory } from "@kb/contracts";
import { useCallback, useEffect, useState } from "react";

export type DesktopScope = "customs" | "all" | "off";
export type DesktopPermission = "unsupported" | NotificationPermission;
export const DESKTOP_SCOPE_KEY = "kb-desktop-notifications";
const DEFAULT_SCOPE: DesktopScope = "customs";

export function readDesktopScope(): DesktopScope {
  try {
    const v = localStorage.getItem(DESKTOP_SCOPE_KEY);
    return v === "all" || v === "off" || v === "customs" ? v : DEFAULT_SCOPE;
  } catch {
    return DEFAULT_SCOPE;
  }
}

function writeDesktopScope(s: DesktopScope) {
  try {
    localStorage.setItem(DESKTOP_SCOPE_KEY, s);
  } catch {
    /* bỏ qua – chế độ riêng tư / chặn lưu trữ */
  }
}

export const desktopPermission = (): DesktopPermission => (typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported");

/** Có hiện thông báo máy tính cho sự kiện này không: đã cho phép + đúng phạm vi + người dùng KHÔNG đang nhìn trang (đang nhìn → chỉ toast). */
export function wantsDesktop(category: NotificationCategory, o: { scope: DesktopScope; permission: DesktopPermission; pageActive: boolean }): boolean {
  if (o.permission !== "granted" || o.pageActive || o.scope === "off") return false;
  return o.scope === "all" || category === "CUSTOMS";
}

export const pageActive = () => !document.hidden && document.hasFocus();

export function useDesktopNotifications() {
  const [scope, setScopeState] = useState<DesktopScope>(DEFAULT_SCOPE);
  const [permission, setPermission] = useState<DesktopPermission>("unsupported");
  // Đọc sau khi gắn (SSR không có window/localStorage).
  useEffect(() => {
    setScopeState(readDesktopScope());
    setPermission(desktopPermission());
  }, []);
  const setScope = useCallback((s: DesktopScope) => {
    writeDesktopScope(s);
    setScopeState(s);
  }, []);
  // Phải gọi trong sự kiện bấm của người dùng (trình duyệt chặn xin quyền tự động).
  const enable = useCallback(async () => {
    if (desktopPermission() === "unsupported") return;
    setPermission(await window.Notification.requestPermission());
  }, []);
  return { scope, setScope, permission, enable };
}
