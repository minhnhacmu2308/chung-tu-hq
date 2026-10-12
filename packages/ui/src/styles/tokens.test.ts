// @vitest-environment node
// Kiểm tra tokens.css: khớp với code TS và mọi cặp chữ/nền đủ tương phản ở mọi tổ hợp (dải xám × sáng/tối).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BRAND_VARS, createBrandTheme, MIN_TEXT_CONTRAST } from "../theme/brand-theme.js";
import { contrast } from "../theme/color.js";
import { GRAY_SCALES, type GrayScale } from "../theme/palette.js";
import { DEFAULT_APPEARANCE } from "../theme/appearance.js";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Lấy các khai báo --kb-* trong khối có selector khớp chính xác. */
function declarations(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selectors = m[1]!.split(",").map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const d of m[2]!.split(";")) {
      const [k, ...v] = d.split(":");
      if (k?.trim().startsWith("--")) out[k.trim()] = v.join(":").trim();
    }
  }
  return out;
}

const semantic = declarations(":root");

function resolve(name: string, gray: GrayScale, mode: "light" | "dark"): string {
  const ramp = gray === "slate" ? declarations(':root[data-gray="slate"]') : declarations(':root[data-gray="gray"]');
  let value = semantic[name] ?? ramp[name];
  if (!value) throw new Error(`Không có token ${name}`);
  const ld = /^light-dark\((.+),\s*(.+)\)$/.exec(value);
  if (ld) value = mode === "light" ? ld[1]!.trim() : ld[2]!.trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  return ref ? resolve(ref[1]!, gray, mode) : value.toUpperCase();
}

const MATRIX = (["slate", "gray"] as const).flatMap((gray) => (["light", "dark"] as const).map((mode) => ({ gray, mode })));

describe("tokens.css khớp với code", () => {
  it.each(["slate", "gray"] as const)("dải xám %s trùng palette.ts", (gray) => {
    const ramp = declarations(`:root[data-gray="${gray}"]`);
    for (const [step, hex] of Object.entries(GRAY_SCALES[gray])) expect(ramp[`--kb-gray-${step}`]?.toUpperCase()).toBe(hex);
  });

  it("màu thương hiệu mặc định = createBrandTheme(DEFAULT_APPEARANCE.brand)", () => {
    const t = createBrandTheme(DEFAULT_APPEARANCE.brand);
    for (const v of BRAND_VARS) expect(semantic[v]).toBe(`light-dark(${t.light[v]}, ${t.dark[v]})`);
  });
});

describe.each(MATRIX)("tương phản – dải xám $gray, chế độ $mode", ({ gray, mode }) => {
  const c = (fg: string, bg: string) => contrast(resolve(fg, gray, mode), resolve(bg, gray, mode));

  it.each(["--kb-color-fg", "--kb-color-fg-muted", "--kb-color-fg-subtle"])("%s đọc được trên bg/surface/surface-muted", (fg) => {
    for (const bg of ["--kb-color-bg", "--kb-color-surface", "--kb-color-surface-muted"]) {
      expect(c(fg, bg), `${fg} trên ${bg}`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it.each(["success", "warning", "danger", "info", "neutral"])("trạng thái %s: chữ trên nền đậm và nền nhạt", (tone) => {
    expect(c(`--kb-color-${tone}-fg`, `--kb-color-${tone}`)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(c(`--kb-color-${tone}-subtle-fg`, `--kb-color-${tone}-subtle`)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it("màu thương hiệu mặc định đọc được trên surface", () => {
    expect(c("--kb-color-primary", "--kb-color-surface")).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});
