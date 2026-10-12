// Sinh bộ token màu thương hiệu từ 1 mã màu, tự chỉnh để đủ tương phản trên nền sáng và nền tối.
import { contrast, ensureContrast, luminance, mix } from "./color.js";
import { SURFACES } from "./palette.js";

/** Ngưỡng WCAG AA cho chữ thường. */
export const MIN_TEXT_CONTRAST = 4.5;
const ON_LIGHT = "#FFFFFF";
const ON_DARK = "#0B0F0D";

export const BRAND_VARS = [
  "--kb-color-primary",
  "--kb-color-primary-hover",
  "--kb-color-primary-active",
  "--kb-color-primary-fg",
  "--kb-color-primary-subtle",
  "--kb-color-primary-subtle-fg",
  "--kb-color-focus",
] as const;
export type BrandVar = (typeof BRAND_VARS)[number];
export type BrandSet = Record<BrandVar, string>;

/** Màu khách chọn bị tự chỉnh để đủ tương phản. Dữ liệu có cấu trúc – UI tự ghép câu theo ngôn ngữ. */
export type BrandAdjustment = { mode: "light" | "dark"; from: string; to: string; minContrast: number };

export interface BrandTheme {
  light: BrandSet;
  dark: BrandSet;
  /** Mô tả khi màu khách chọn phải chỉnh để đủ tương phản (hiển thị cho admin). */
  adjustments: BrandAdjustment[];
}

/** Nền "khó" nhất của mỗi chế độ: sáng → nền sáng nhất; tối → nền tối sáng nhất. */
function worstSurface(mode: "light" | "dark"): string {
  const list = [...SURFACES[mode]];
  return list.sort((a, b) => (mode === "light" ? luminance(a) - luminance(b) : luminance(b) - luminance(a)))[0]!;
}

function onColor(bg: string): string {
  return contrast(ON_LIGHT, bg) >= contrast(ON_DARK, bg) ? ON_LIGHT : ON_DARK;
}

function buildSet(mode: "light" | "dark", requested: string, adjustments: BrandAdjustment[]): BrandSet {
  const surface = worstSurface(mode);
  const toward = mode === "light" ? "#000000" : "#FFFFFF";
  const primary = ensureContrast(requested, surface, MIN_TEXT_CONTRAST, toward);
  if (primary !== requested) {
    adjustments.push({ mode, from: requested, to: primary, minContrast: MIN_TEXT_CONTRAST });
  }
  const subtle = mix(primary, surface, mode === "light" ? 0.88 : 0.8);
  return {
    "--kb-color-primary": primary,
    "--kb-color-primary-hover": mix(primary, toward, 0.12),
    "--kb-color-primary-active": mix(primary, toward, 0.22),
    "--kb-color-primary-fg": onColor(primary),
    "--kb-color-primary-subtle": subtle,
    "--kb-color-primary-subtle-fg": ensureContrast(primary, subtle, MIN_TEXT_CONTRAST, toward),
    "--kb-color-focus": primary,
  };
}

export function createBrandTheme(hex: string): BrandTheme {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Màu thương hiệu không hợp lệ: ${hex}`);
  const requested = hex.toUpperCase();
  const adjustments: BrandAdjustment[] = [];
  return { light: buildSet("light", requested, adjustments), dark: buildSet("dark", requested, adjustments), adjustments };
}

/**
 * CSS ghi đè màu thương hiệu – chèn bằng <style> trong layout gốc.
 * Dùng light-dark() nên một khối áp dụng cho cả sáng/tối/theo hệ thống.
 * An toàn để chèn: mọi giá trị là hex do hàm này sinh ra.
 */
export function brandThemeCss(theme: BrandTheme, selector = ":root"): string {
  const body = BRAND_VARS.map((v) => `${v}:light-dark(${theme.light[v]},${theme.dark[v]})`).join(";");
  return `${selector}{${body}}`;
}
