// Cấu hình giao diện: mặc định hệ thống → cấu hình doanh nghiệp (admin, có thể khóa) → tùy chọn người dùng.
import { z } from "zod";
import { brandThemeCss, createBrandTheme, type BrandAdjustment } from "./brand-theme.js";

export const APPEARANCE_OPTIONS = {
  locale: ["vi", "en", "zh"],
  mode: ["light", "dark", "system"],
  density: ["compact", "comfortable", "spacious"],
  fontSize: ["sm", "md", "lg"],
  font: ["geist", "inter", "roboto", "be-vietnam-pro", "sf-pro", "system"],
  gray: ["slate", "gray"],
  backdrop: ["flat", "aurora"],
  radius: ["square", "default", "rounded"],
  menuPosition: ["left", "top", "right"],
} as const;

/** Màu thương hiệu gợi ý. Admin vẫn có thể nhập mã màu riêng (được kiểm tra tương phản). */
export const BRAND_PRESETS = [
  { id: "khaibao", label: "KhaiBáo", labelEn: "KhaiBáo", labelZh: "KhaiBáo", hex: "#0F6B55" },
  { id: "blue", label: "Xanh dương", labelEn: "Blue", labelZh: "蓝色", hex: "#2563EB" },
  { id: "green", label: "Xanh lá", labelEn: "Green", labelZh: "绿色", hex: "#2F7D4F" },
  { id: "indigo", label: "Chàm", labelEn: "Indigo", labelZh: "靛蓝", hex: "#5B4BDB" },
  { id: "teal", label: "Ngọc", labelEn: "Teal", labelZh: "青绿", hex: "#0E7C74" },
  { id: "rose", label: "Hồng", labelEn: "Rose", labelZh: "玫红", hex: "#E11D48" },
  { id: "orange", label: "Cam", labelEn: "Orange", labelZh: "橙色", hex: "#EA580C" },
  { id: "slate", label: "Xám đá", labelEn: "Slate", labelZh: "石板灰", hex: "#475569" },
] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Màu phải có dạng #RRGGBB");

export const Appearance = z.object({
  locale: z.enum(APPEARANCE_OPTIONS.locale),
  mode: z.enum(APPEARANCE_OPTIONS.mode),
  density: z.enum(APPEARANCE_OPTIONS.density),
  fontSize: z.enum(APPEARANCE_OPTIONS.fontSize),
  font: z.enum(APPEARANCE_OPTIONS.font),
  gray: z.enum(APPEARANCE_OPTIONS.gray),
  backdrop: z.enum(APPEARANCE_OPTIONS.backdrop),
  radius: z.enum(APPEARANCE_OPTIONS.radius),
  menuPosition: z.enum(APPEARANCE_OPTIONS.menuPosition),
  brand: hex,
  cursorEffect: z.boolean(),
  showPageDescription: z.boolean(),
});
export type Appearance = z.infer<typeof Appearance>;

export const DEFAULT_APPEARANCE: Appearance = {
  locale: "vi",
  mode: "system",
  density: "comfortable",
  fontSize: "md",
  font: "be-vietnam-pro",
  gray: "slate",
  backdrop: "flat",
  radius: "default",
  menuPosition: "left",
  brand: "#0F6B55",
  cursorEffect: false,
  showPageDescription: true,
};

/** Trường doanh nghiệp được đặt mặc định và có thể khóa. */
export const ORG_FIELDS = ["brand", "radius", "font", "gray", "backdrop"] as const;
export type OrgField = (typeof ORG_FIELDS)[number];

export const OrgAppearance = Appearance.pick({ brand: true, radius: true, font: true, gray: true, backdrop: true })
  .partial()
  .extend({ locked: z.array(z.enum(ORG_FIELDS)).default([]) });
export type OrgAppearance = z.input<typeof OrgAppearance>;

export const UserAppearance = Appearance.partial();
export type UserAppearance = z.infer<typeof UserAppearance>;

export interface ResolvedAppearance {
  appearance: Appearance;
  /** Trường người dùng đặt nhưng bị doanh nghiệp khóa nên không áp dụng. */
  ignoredUserFields: OrgField[];
}

export function resolveAppearance(org: OrgAppearance = {}, user: UserAppearance = {}): ResolvedAppearance {
  const { locked, ...orgValues } = OrgAppearance.parse(org);
  const userValues = UserAppearance.parse(user);
  const ignoredUserFields = locked.filter((f) => userValues[f] !== undefined);
  const userAllowed = Object.fromEntries(
    Object.entries(userValues).filter(([k]) => !locked.includes(k as OrgField)),
  ) as UserAppearance;
  const appearance = Appearance.parse({ ...DEFAULT_APPEARANCE, ...orgValues, ...userAllowed });
  return { appearance, ignoredUserFields };
}

/** Thuộc tính đặt lên <html>. CSS tĩnh trong tokens.css đọc các thuộc tính này. */
export function appearanceAttributes(a: Appearance): Record<string, string> {
  return {
    lang: a.locale,
    ...(a.mode === "system" ? {} : { "data-theme": a.mode }),
    "data-density": a.density,
    "data-font-size": a.fontSize,
    "data-font": a.font,
    "data-gray": a.gray,
    "data-backdrop": a.backdrop,
    "data-radius": a.radius,
    "data-menu-position": a.menuPosition,
    "data-cursor-effect": a.cursorEffect ? "on" : "off",
    "data-page-description": a.showPageDescription ? "shown" : "hidden",
  };
}

/** CSS động duy nhất: màu thương hiệu. Mọi thứ khác là CSS tĩnh theo thuộc tính. */
export function appearanceCss(a: Appearance): { css: string; adjustments: BrandAdjustment[] } {
  const theme = createBrandTheme(a.brand);
  return { css: brandThemeCss(theme), adjustments: theme.adjustments };
}
