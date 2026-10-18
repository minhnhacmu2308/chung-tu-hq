import { LAYOUT_IDA, type LayoutBlock, type LayoutGroup, type LayoutItem } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { blockCollapsedByDefault, groupSpan, itemVisible, neighborSections } from "./compact-rules";
import { conditionContext } from "./form-state";

const section = (id: string) => LAYOUT_IDA.declarant.find((s) => s.id === id)!;
const block = (sectionId: string, id: string) => section(sectionId).blocks.find((b) => b.id === id)!;
const field = (b: LayoutBlock, key: string) => b.items.find((it) => it.kind === "field" && it.key === key)!;
const ctx = (v: Record<string, string>) => conditionContext("IDA", v);

describe("itemVisible – chế độ hiển thị (E)", () => {
  const toKhai = block("chung", "to-khai");
  it("“Ô áp dụng” và “Tất cả”: mọi ô đều hiện (điều kiện áp dụng xét riêng)", () => {
    for (const mode of ["ap-dung", "tat-ca"] as const) expect(itemVisible(mode, "IDA", field(toKhai, "TK_CCC"), {}, ctx({}), undefined)).toBe(true);
  });
  it("“Ô cần nhập”: ô bắt buộc luôn hiện; ô không bắt buộc chỉ hiện khi đã có giá trị", () => {
    expect(itemVisible("can-nhap", "IDA", field(toKhai, "TK_ICB"), {}, ctx({}), undefined)).toBe(true);
    const ref = field(block("dinh-kem", "ghi-chu"), "TK_REF");
    expect(itemVisible("can-nhap", "IDA", ref, {}, ctx({}), undefined)).toBe(false);
    expect(itemVisible("can-nhap", "IDA", ref, { TK_REF: "NB-01" }, ctx({}), undefined)).toBe(true);
  });
  it("“Ô cần nhập”: ô theo tình huống hiện khi điều kiện đang áp dụng (tạm nhập → thời hạn tái xuất)", () => {
    const red = field(block("chung", "chia-nho"), "TK_RED");
    expect(itemVisible("can-nhap", "IDA", red, { TK_ICB: "G12" }, ctx({ TK_ICB: "G12" }), undefined)).toBe(true);
    expect(itemVisible("can-nhap", "IDA", red, { TK_ICB: "A11" }, ctx({ TK_ICB: "A11" }), undefined)).toBe(false);
  });
  it("“Ô cần nhập”: nhóm / nhóm lặp hiện nếu có ô con cần nhập hoặc đã có dữ liệu", () => {
    const vd = block("van-chuyen", "van-don");
    const bills = vd.items.find((it) => it.kind === "repeat" && it.no === "1.26") as LayoutItem;
    expect(itemVisible("can-nhap", "IDA", bills, {}, ctx({}), undefined)).toBe(true);
    const transit = block("van-chuyen", "trung-chuyen").items.find((it) => it.kind === "repeat")!;
    expect(itemVisible("can-nhap", "IDA", transit, {}, ctx({}), undefined)).toBe(false);
    expect(itemVisible("can-nhap", "IDA", transit, { TK_ST2: "02CIS01" }, ctx({}), undefined)).toBe(true);
  });
});

describe("blockCollapsedByDefault – khối trống ít dùng đóng sẵn (E)", () => {
  it("khối không có ô cần nhập và chưa có dữ liệu → đóng; có dữ liệu → mở", () => {
    const bl = block("thue-bao-lanh", "bao-lanh");
    expect(blockCollapsedByDefault("IDA", bl, {}, ctx({}))).toBe(true);
    expect(blockCollapsedByDefault("IDA", bl, { TK_SBC: "01310001" }, ctx({}))).toBe(false);
  });
  it("khối có ô bắt buộc → luôn mở", () => {
    expect(blockCollapsedByDefault("IDA", block("chung", "to-khai"), {}, ctx({}))).toBe(false);
  });
});

describe("groupSpan – nhóm ô ngắn không chiếm cả hàng (D)", () => {
  const g = (fields: { width?: "xs" | "sm" | "md" | "lg" | "full"; input?: "text" | "textarea" }[]): LayoutGroup => ({
    kind: "group", label: "x", fields: fields.map((f, i) => ({ kind: "field", key: `K${i}`, label: "k", input: f.input ?? "text", ...(f.width ? { width: f.width } : {}) })),
  });
  it("2–3 ô ngắn → nửa hàng (2 cột); có ô rộng, ô nhiều dòng hoặc từ 4 ô → cả hàng", () => {
    expect(groupSpan(g([{ width: "sm" }, { width: "xs" }]))).toBe("half");
    expect(groupSpan(g([{ width: "sm" }, { width: "md" }, { width: "xs" }]))).toBe("half");
    expect(groupSpan(g([{ width: "lg" }, { width: "xs" }]))).toBe("full");
    expect(groupSpan(g([{ input: "textarea" }]))).toBe("full");
    expect(groupSpan(g([{}, {}, {}, {}]))).toBe("full");
  });
});

describe("neighborSections – nút Nhóm trước / Nhóm tiếp (G)", () => {
  const nav = [{ id: "a", title: "1. A" }, { id: "b", title: "2. B" }, { id: "c", title: "3. C" }];
  it("trả nhóm liền trước / liền sau; đầu và cuối thì không có", () => {
    expect(neighborSections(nav, "b")).toEqual({ prev: nav[0], next: nav[2] });
    expect(neighborSections(nav, "a")).toEqual({ prev: undefined, next: nav[1] });
    expect(neighborSections(nav, "c")).toEqual({ prev: nav[1], next: undefined });
  });
});
