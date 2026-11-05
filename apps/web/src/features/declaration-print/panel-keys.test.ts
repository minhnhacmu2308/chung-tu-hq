import { describe, expect, it } from "vitest";
import { panelShortcut, revertField } from "./panel-keys";

const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe("panelShortcut", () => {
  it("Ctrl+S, Ctrl+Enter, ⌘S → lưu; F1 → bảng phím tắt", () => {
    expect(panelShortcut(k("s", { ctrlKey: true }))).toBe("SAVE");
    expect(panelShortcut(k("S", { ctrlKey: true }))).toBe("SAVE");
    expect(panelShortcut(k("Enter", { ctrlKey: true }))).toBe("SAVE");
    expect(panelShortcut(k("s", { metaKey: true }))).toBe("SAVE");
    expect(panelShortcut(k("F1"))).toBe("HELP");
  });
  it("phím khác / tổ hợp khác / đang gõ bộ gõ → không làm gì", () => {
    expect(panelShortcut(k("s"))).toBeNull();
    expect(panelShortcut(k("Enter"))).toBeNull();
    expect(panelShortcut(k("s", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(panelShortcut(k("s", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(panelShortcut(k("Enter", { ctrlKey: true, isComposing: true }))).toBeNull();
    expect(panelShortcut(k("F1", { shiftKey: true }))).toBeNull();
  });
});

describe("revertField", () => {
  const base = { TK_MTC: "2", TK_VSC: "9999", TK_DSC: "SEGOT", TK_PSC: "VNHPH", TK_NOTE: "" };
  it("ô đã sửa → bỏ thay đổi của ô và các ô quy tắc tự đổi theo nó", () => {
    const changes = { TK_MTC: "4", TK_VSC: "", TK_NOTE: "ABC" };
    const derived = new Map([["TK_VSC", "TK_MTC"]]);
    expect(revertField(changes, base, "TK_MTC", derived)).toEqual({ TK_NOTE: "ABC" });
  });
  it("ô phụ thuộc đã sửa tay (không còn trong derivedFrom) → giữ", () => {
    const changes = { TK_MTC: "4", TK_VSC: "VN0123" };
    expect(revertField(changes, base, "TK_MTC", new Map())).toEqual({ TK_VSC: "VN0123" });
  });
  it("chỉ bỏ ô đang đứng, các ô sửa khác giữ nguyên", () => {
    expect(revertField({ TK_NOTE: "ABC", TK_PSC: "VNSGN" }, base, "TK_NOTE", new Map())).toEqual({ TK_PSC: "VNSGN" });
  });
  it("ô chưa sửa / sửa rồi gõ lại đúng giá trị cũ → null (Esc đóng panel)", () => {
    expect(revertField({ TK_NOTE: "ABC" }, base, "TK_MTC", new Map())).toBeNull();
    expect(revertField({ TK_MTC: "2" }, base, "TK_MTC", new Map())).toBeNull();
  });
});
