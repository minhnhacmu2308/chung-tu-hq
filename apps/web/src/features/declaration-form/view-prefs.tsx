"use client";
// Tùy chọn hiển thị của bản mẫu tờ khai (theo từng người xem, nhớ trong trình duyệt): chế độ ô (E), nhãn bên trái (F).
// Mật độ (H) dùng chung cấu hình Giao diện của cả ứng dụng (useAppearance).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ViewMode } from "./compact-rules";

export type ViewPrefs = { mode: ViewMode; labelsLeft: boolean };
const DEFAULT: ViewPrefs = { mode: "ap-dung", labelsLeft: false };
const KEY = "kb-to-khai-hien-thi";

type Ctx = ViewPrefs & { set: (patch: Partial<ViewPrefs>) => void };
const ViewPrefsContext = createContext<Ctx>({ ...DEFAULT, set: () => {} });

export function ViewPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<ViewPrefs>;
      setPrefs((p) => ({
        mode: saved.mode === "can-nhap" || saved.mode === "tat-ca" || saved.mode === "ap-dung" ? saved.mode : p.mode,
        labelsLeft: typeof saved.labelsLeft === "boolean" ? saved.labelsLeft : p.labelsLeft,
      }));
    } catch {
      // Không đọc được bộ nhớ trình duyệt → dùng mặc định.
    }
  }, []);
  const set = (patch: Partial<ViewPrefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Bộ nhớ bị chặn → chỉ giữ trong phiên.
      }
      return next;
    });
  return <ViewPrefsContext.Provider value={{ ...prefs, set }}>{children}</ViewPrefsContext.Provider>;
}

export const useViewPrefs = () => useContext(ViewPrefsContext);
