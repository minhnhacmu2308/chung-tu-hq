import { describe, expect, it } from "vitest";
import { BRAND_PRESETS } from "./appearance.js";
import { BRAND_VARS, brandThemeCss, createBrandTheme, MIN_TEXT_CONTRAST } from "./brand-theme.js";
import { contrast } from "./color.js";
import { SURFACES } from "./palette.js";

// Màu "khó": quá sáng, quá tối, bão hòa, xám – đại diện cho thứ khách có thể chọn.
const HARD_COLORS = ["#FFFF00", "#00FF00", "#FFFFFF", "#000000", "#777777", "#FF00FF", "#00BFFF", "#FFA500", "#C0C0C0", "#1A1A1A"];
const ALL = [...BRAND_PRESETS.map((p) => p.hex), ...HARD_COLORS];

describe("createBrandTheme", () => {
  it.each(ALL)("%s: chữ màu thương hiệu đủ tương phản trên mọi nền sáng/tối", (hex) => {
    const t = createBrandTheme(hex);
    for (const s of SURFACES.light) expect(contrast(t.light["--kb-color-primary"], s)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    for (const s of SURFACES.dark) expect(contrast(t.dark["--kb-color-primary"], s)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it.each(ALL)("%s: chữ trên nút primary và chữ trên nền subtle đủ tương phản", (hex) => {
    const t = createBrandTheme(hex);
    for (const set of [t.light, t.dark]) {
      expect(contrast(set["--kb-color-primary-fg"], set["--kb-color-primary"])).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(contrast(set["--kb-color-primary-subtle-fg"], set["--kb-color-primary-subtle"])).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it("giữ nguyên màu đã đủ tương phản và không ghi chú điều chỉnh cho nền sáng", () => {
    const t = createBrandTheme("#0F6B55");
    expect(t.light["--kb-color-primary"]).toBe("#0F6B55");
    expect(t.adjustments.some((a) => a.mode === "light")).toBe(false);
  });

  it("tự chỉnh màu quá sáng và ghi lại lý do để báo admin", () => {
    const t = createBrandTheme("#FFFF00");
    expect(t.light["--kb-color-primary"]).not.toBe("#FFFF00");
    expect(t.adjustments).toContainEqual(expect.objectContaining({ mode: "light", from: "#FFFF00", minContrast: 4.5 }));
  });

  it("chuẩn hóa chữ hoa", () => {
    expect(createBrandTheme("#0f6b55").light["--kb-color-primary"]).toBe("#0F6B55");
  });

  it.each(["0F6B55", "#FFF", "#GGGGGG", "red", "#0F6B55;}body{display:none"])("từ chối giá trị không hợp lệ: %s", (bad) => {
    expect(() => createBrandTheme(bad)).toThrow();
  });
});

describe("brandThemeCss", () => {
  it("sinh 1 khối light-dark() cho đủ biến, chỉ chứa giá trị hex", () => {
    const css = brandThemeCss(createBrandTheme("#2563EB"));
    for (const v of BRAND_VARS) expect(css).toMatch(new RegExp(`${v}:light-dark\\(#[0-9A-F]{6},#[0-9A-F]{6}\\)`));
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).not.toMatch(/[<>]|url\(|expression|@import/i);
  });
});
