// Cài web thành ứng dụng máy tính (PWA). Chrome/Edge bắn `beforeinstallprompt` rất sớm – có khi trước khi
// component nào mount – nên bắt sự kiện ở cấp module rồi cho component đọc qua useSyncExternalStore.
import { useSyncExternalStore } from "react";

/** Sự kiện chưa có trong lib.dom chuẩn (chỉ Chromium). */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * - `installed`: đang chạy trong cửa sổ ứng dụng đã cài.
 * - `available`: trình duyệt cho cài ngay bằng một nút (Chrome/Edge).
 * - `manual`: trình duyệt không có hộp thoại cài tự động → hướng dẫn theo trình duyệt (Safari: Thêm vào Dock).
 * - `unsupported`: trình duyệt không cài được (Firefox máy tính).
 */
export type InstallState = "installed" | "available" | "manual" | "unsupported";
export type BrowserKind = "safari" | "firefox" | "chromium" | "other";

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // tự hiện nút trong app thay cho thanh gợi ý mặc định
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

export function detectBrowser(ua: string): BrowserKind {
  if (/Firefox\//.test(ua)) return "firefox";
  if (/(Chrome|Chromium|Edg)\//.test(ua)) return "chromium";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: window-controls-overlay)").matches || nav.standalone === true;
}

/** Hàm thuần để test: trạng thái từ các tín hiệu của trình duyệt. */
export function installStateOf(s: { standalone: boolean; installedNow: boolean; hasPrompt: boolean; browser: BrowserKind }): InstallState {
  if (s.standalone || s.installedNow) return "installed";
  if (s.hasPrompt) return "available";
  if (s.browser === "firefox") return "unsupported";
  return "manual";
}

function snapshot(): InstallState {
  return installStateOf({ standalone: isStandalone(), installedNow, hasPrompt: deferred !== null, browser: detectBrowser(navigator.userAgent) });
}

function subscribe(l: () => void) {
  listeners.add(l);
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener?.("change", l);
  return () => {
    listeners.delete(l);
    mq?.removeEventListener?.("change", l);
  };
}

/** Trạng thái cài đặt + hàm mở hộp thoại cài của trình duyệt (trả true khi người dùng đồng ý). */
export function useInstallApp() {
  const state = useSyncExternalStore(subscribe, snapshot, () => "unsupported" as InstallState);
  const browser = typeof navigator === "undefined" ? "other" : detectBrowser(navigator.userAgent);
  const install = async (): Promise<boolean> => {
    const e = deferred;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred = null; // mỗi sự kiện chỉ prompt được một lần
    emit();
    return outcome === "accepted";
  };
  return { state, browser, install };
}

/** Chỉ dùng trong test. */
export function __setDeferredPromptForTest(e: BeforeInstallPromptEvent | null, installed = false) {
  deferred = e;
  installedNow = installed;
  emit();
}
