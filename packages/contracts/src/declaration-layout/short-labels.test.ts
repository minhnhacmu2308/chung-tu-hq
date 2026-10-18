import { describe, expect, it } from "vitest";
import { fieldRole, LAYOUT_EDA, LAYOUT_IDA, type DeclarationLayout, type LayoutField } from "./index.js";

// Ngưỡng theo lưới 4 cột (~190px/ô, chữ 14px): nhãn "số · tên" từ 27 ký tự xuống dòng (vd "1.5 · Mã phân loại hàng hóa");
// nhãn ô "theo tình huống" có thêm " TH" (3 ký tự). Ô con trong nhóm / cột bảng nhóm lặp: rộng xs (112px) quá 15 ký tự, sm (160px) quá 22 ký tự.
const TOP_MAX = 26;
const topMax = (kind: "IDA" | "EDA", f: LayoutField) => (fieldRole(kind, f) === "CONDITIONAL" ? TOP_MAX - 3 : TOP_MAX);
const SUB_MAX = { xs: 15, sm: 22 } as const;
const title = (f: LayoutField, label: string) => (f.no ? `${f.no} · ${label}` : label);

function all(layout: DeclarationLayout) {
  const blocks = [...layout.declarant.flatMap((s) => s.blocks), ...layout.item.declarant];
  const top: LayoutField[] = [];
  const sub: LayoutField[] = [];
  for (const b of blocks) for (const it of b.items) {
    if (it.kind === "field") top.push(it);
    else sub.push(...it.fields);
  }
  return { top, sub };
}
const wide = (f: LayoutField) => f.input === "textarea" || f.input === "choice" || f.width === "lg" || f.width === "full";

describe.each([LAYOUT_IDA, LAYOUT_EDA])("$kind – nhãn dài có chữ viết tắt (bấm xem tên đầy đủ)", (layout) => {
  const { top, sub } = all(layout);
  it("ô thường: nhãn từ 27 ký tự có chữ viết tắt, viết tắt vừa một dòng", () => {
    const missing = top.filter((f) => !wide(f) && title(f, f.label).length > topMax(layout.kind, f) && !f.short).map((f) => title(f, f.label));
    expect(missing).toEqual([]);
    const tooLong = top.filter((f) => f.short && title(f, f.short).length > topMax(layout.kind, f)).map((f) => title(f, f.short!));
    expect(tooLong).toEqual([]);
  });
  it("ô con trong nhóm / cột bảng: nhãn quá bề rộng ô có chữ viết tắt", () => {
    const limit = (f: LayoutField) => (f.width === "xs" ? SUB_MAX.xs : f.width === "sm" || !f.width ? SUB_MAX.sm : Infinity);
    expect(sub.filter((f) => !wide(f) && f.label.length > limit(f) && !f.short).map((f) => f.label)).toEqual([]);
    expect(sub.filter((f) => f.short && f.short.length > limit(f)).map((f) => f.short)).toEqual([]);
  });
  it("chữ viết tắt ngắn hơn tên đầy đủ; mã PLHH đúng ví dụ của người dùng", () => {
    expect([...top, ...sub].filter((f) => f.short && f.short.length >= f.label.length).map((f) => f.key)).toEqual([]);
    expect(top.find((f) => f.key === "TK_CCC")?.short).toBe("Mã PLHH");
  });
});
