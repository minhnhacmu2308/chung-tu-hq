"use client";
// Cấu hình giao diện của người dùng: lưu localStorage (prototype). Có backend → lưu theo user + org (resolveAppearance).
import { Appearance as AppearanceSchema, appearanceAttributes, appearanceCss, DEFAULT_APPEARANCE, type Appearance } from "@kb/ui/theme";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const KEY = "kb-appearance";
const ATTRS = ["data-theme", "data-density", "data-font-size", "data-font", "data-gray", "data-backdrop", "data-radius", "data-menu-position", "data-cursor-effect", "data-page-description"];

type Ctx = { appearance: Appearance; setAppearance: (a: Appearance) => void; adjustments: ReturnType<typeof appearanceCss>["adjustments"] };
const AppearanceContext = createContext<Ctx | null>(null);

function read(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = AppearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, ...JSON.parse(raw) });
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* bỏ qua */
  }
  return DEFAULT_APPEARANCE;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setState] = useState<Appearance>(DEFAULT_APPEARANCE);
  useEffect(() => setState(read()), []);
  const { css, adjustments } = useMemo(() => appearanceCss(appearance), [appearance]);

  useEffect(() => {
    const root = document.documentElement;
    for (const k of ATTRS) root.removeAttribute(k);
    for (const [k, v] of Object.entries(appearanceAttributes(appearance))) root.setAttribute(k, v);
    root.lang = appearance.locale;
    let tag = document.getElementById("kb-brand");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "kb-brand";
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }, [appearance, css]);

  const setAppearance = (a: Appearance) => {
    setState(a);
    try {
      localStorage.setItem(KEY, JSON.stringify(a));
    } catch {
      /* bỏ qua */
    }
  };

  return <AppearanceContext.Provider value={{ appearance, setAppearance, adjustments }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance phải nằm trong AppearanceProvider");
  return ctx;
}
