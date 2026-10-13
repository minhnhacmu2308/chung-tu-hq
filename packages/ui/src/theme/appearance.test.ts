import { describe, expect, it } from "vitest";
import { appearanceAttributes, appearanceCss, DEFAULT_APPEARANCE, resolveAppearance } from "./appearance.js";

describe("resolveAppearance", () => {
  it("không có cấu hình nào → mặc định hệ thống", () => {
    expect(resolveAppearance().appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it("thứ tự ưu tiên: mặc định < doanh nghiệp < người dùng", () => {
    const { appearance } = resolveAppearance({ brand: "#2563EB", radius: "square" }, { radius: "rounded", mode: "dark" });
    expect(appearance.brand).toBe("#2563EB"); // từ doanh nghiệp
    expect(appearance.radius).toBe("rounded"); // người dùng ghi đè
    expect(appearance.mode).toBe("dark");
    expect(appearance.density).toBe(DEFAULT_APPEARANCE.density); // mặc định
  });

  it("trường doanh nghiệp đã khóa: bỏ qua giá trị người dùng và báo lại", () => {
    const r = resolveAppearance({ brand: "#2563EB", locked: ["brand"] }, { brand: "#E11D48", density: "compact" });
    expect(r.appearance.brand).toBe("#2563EB");
    expect(r.appearance.density).toBe("compact");
    expect(r.ignoredUserFields).toEqual(["brand"]);
  });

  it("từ chối giá trị ngoài danh sách cho phép", () => {
    expect(() => resolveAppearance({}, { density: "huge" as never })).toThrow();
    expect(() => resolveAppearance({ brand: "blue" })).toThrow();
  });
});

describe("appearanceAttributes", () => {
  it("chế độ theo hệ thống → không đặt data-theme", () => {
    const attrs = appearanceAttributes({ ...DEFAULT_APPEARANCE, mode: "system" });
    expect(attrs).not.toHaveProperty("data-theme");
    expect(attrs.lang).toBe("vi");
  });

  it("ánh xạ đủ các tùy chọn sang data-*", () => {
    const attrs = appearanceAttributes({
      ...DEFAULT_APPEARANCE,
      mode: "dark",
      density: "compact",
      gray: "gray",
      showPageDescription: false,
      cursorEffect: true,
    });
    expect(attrs).toMatchObject({
      "data-theme": "dark",
      "data-density": "compact",
      "data-gray": "gray",
      "data-page-description": "hidden",
      "data-cursor-effect": "on",
    });
  });
});

describe("appearanceCss", () => {
  it("trả về CSS màu thương hiệu và ghi chú điều chỉnh", () => {
    const r = appearanceCss({ ...DEFAULT_APPEARANCE, brand: "#EA580C" });
    expect(r.css).toContain("--kb-color-primary:light-dark(");
    expect(r.adjustments.length).toBeGreaterThan(0);
  });
});

describe("vị trí menu", () => {
  it("mặc định bên trái; người dùng đổi được; xuất ra data-menu-position", () => {
    expect(DEFAULT_APPEARANCE.menuPosition).toBe("left");
    expect(appearanceAttributes(DEFAULT_APPEARANCE)["data-menu-position"]).toBe("left");
    const { appearance } = resolveAppearance({}, { menuPosition: "top" });
    expect(appearanceAttributes(appearance)["data-menu-position"]).toBe("top");
    expect(() => resolveAppearance({}, { menuPosition: "bottom" as never })).toThrow();
  });
});
