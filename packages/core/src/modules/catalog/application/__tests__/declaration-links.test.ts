// Phần CatalogPort phục vụ tờ khai / bài học (Task 5): mô tả mặt hàng theo lô, bộ nhà cung cấp tự tạo, bài học LINE → đề xuất bí danh.
import { beforeEach, describe, expect, it } from "vitest";
import { createCatalogPort } from "../catalog-port.js";
import { createItem } from "../items.js";
import { proposeLessonAlias } from "../aliases.js";
import { mergeItems } from "../merge.js";
import { admin, declarant, makeHarness, ORG, OTHER, seedAlias, seedSet, viewer, type Harness } from "./_harness.js";

let h: Harness;

async function item(name: string, code: string, extra: Record<string, unknown> = {}) {
  const r = await createItem(h.deps, admin, { kind: "MATERIAL", name, hsCode: "52081100", baseUnit: "MTR", codeSetId: "cst_kt", code, ...extra });
  if (!r.ok || r.value.status !== "CREATED") throw new Error(JSON.stringify(r));
  return r.value.item.item.id;
}

beforeEach(() => {
  h = makeHarness();
  seedSet(h, { id: "cst_kt", kind: "ACCOUNTING" });
  seedSet(h, { id: "cst_xnk", kind: "CUSTOMS", isDefault: true });
});

describe("CatalogPort.describeItems", () => {
  it("mặt hàng cuối chuỗi gộp + mã XNK mới nhất + mọi mã ACTIVE + quy đổi; id lạ / org khác → không có", async () => {
    const a = await item("Vải A", "A-1", { conversions: [{ unit: "ROL", factor: "100" }] });
    const b = await item("Vải B", "B-1", { conversions: [{ unit: "ROL", factor: "100" }] });
    seedAlias(h, { id: "ali_hq", codeSetId: "cst_xnk", code: "HQ-B", codeKey: "HQB", itemId: b });
    expect((await mergeItems(h.deps, admin, { fromId: a, intoId: b })).ok).toBe(true);
    const port = createCatalogPort(h.deps);
    const got = await port.describeItems(ORG, [a, "cat_none"]);
    expect(Object.keys(got)).toEqual([a]);
    expect(got[a]).toMatchObject({ id: b, name: "Vải B", baseUnit: "MTR", customs: { code: "HQ-B", aliasId: "ali_hq", codeSetId: "cst_xnk" }, conversion: { base: "MTR", factors: { ROL: "100" } } });
    expect(got[a]!.itemNo).toMatch(/^MH-\d{6}$/);
    expect([...got[a]!.codes].sort()).toEqual(["A-1", "B-1", "HQ-B"]);
    expect(await port.describeItems(OTHER, [a])).toEqual({});
  });
});

describe("CatalogPort.ensurePartnerSet", () => {
  it("chưa có bộ nhà cung cấp theo tên → tạo một lần (tên viết khác vẫn cùng bộ); org khác tách biệt; tên rỗng → null", async () => {
    const port = createCatalogPort(h.deps);
    const id = await port.ensurePartnerSet(ORG, "SUPPLIER", "HANSOL PRECISION CO., LTD.");
    expect(id).toBeTruthy();
    expect(await port.ensurePartnerSet(ORG, "SUPPLIER", "  hansol precision co., ltd. ")).toBe(id);
    expect(h.uow.data.codeSets.filter((s) => s.kind === "SUPPLIER")).toHaveLength(1);
    expect(h.uow.data.codeSets.find((s) => s.id === id)).toMatchObject({ orgId: ORG, kind: "SUPPLIER", partnerName: "HANSOL PRECISION CO., LTD.", isDefault: false });
    expect(await port.ensurePartnerSet(ORG, "SUPPLIER", "  ")).toBeNull();
    seedSet(h, { id: "cst_xnk_b", kind: "CUSTOMS", isDefault: true }, OTHER);
    const other = await port.ensurePartnerSet(OTHER, "SUPPLIER", "HANSOL PRECISION CO., LTD.");
    expect(other).not.toBe(id);
  });
});

describe("CatalogPort.findPartnerSet", () => {
  it("tra bộ đối tác theo tên chuẩn hóa mà KHÔNG tạo; chưa có / tên rỗng / org khác → null", async () => {
    const port = createCatalogPort(h.deps);
    expect(await port.findPartnerSet(ORG, "CUSTOMER", "NORDIC TOOLING GROUP AB")).toBeNull();
    expect(h.uow.data.codeSets.filter((s) => s.kind === "CUSTOMER")).toHaveLength(0);
    const id = await port.ensurePartnerSet(ORG, "CUSTOMER", "NORDIC TOOLING GROUP AB");
    expect(await port.findPartnerSet(ORG, "CUSTOMER", "  nordic tooling group ab ")).toBe(id);
    expect(await port.findPartnerSet(ORG, "SUPPLIER", "NORDIC TOOLING GROUP AB")).toBeNull();
    expect(await port.findPartnerSet(ORG, "CUSTOMER", "  ")).toBeNull();
    expect(await port.findPartnerSet(OTHER, "CUSTOMER", "NORDIC TOOLING GROUP AB")).toBeNull();
  });
});

describe("proposeLessonAlias – bài học LINE đã duyệt → đề xuất bí danh (source LESSON)", () => {
  const lesson = { partnerName: "ZHUHAI RISE LIGHTING CO., LTD", code: "2118564ACOT96", name: "Vải cotton", hsCode: "5208.11.00" };

  it("khớp chắc mặt hàng (HS 8 số + tên) → bí danh PROPOSED trong bộ nhà cung cấp (kể cả Quản trị duyệt bài học); gọi lại không trùng", async () => {
    const a = await item("Vải cotton", "VT-1");
    const r = await proposeLessonAlias(h.deps, admin, lesson);
    expect(r).toMatchObject({ ok: true, value: { status: "PROPOSED", itemId: a } });
    const set = h.uow.data.codeSets.find((s) => s.kind === "SUPPLIER")!;
    expect(h.uow.data.aliases.filter((x) => x.source === "LESSON")).toEqual([expect.objectContaining({ codeSetId: set.id, code: "2118564ACOT96", itemId: a, status: "PROPOSED" })]);
    expect((await proposeLessonAlias(h.deps, admin, lesson)).ok).toBe(true);
    expect(h.uow.data.aliases.filter((x) => x.source === "LESSON")).toHaveLength(1);
  });

  it("mã đã ACTIVE trong bộ nhà cung cấp → EXISTS; không khớp → hàng chờ (bộ nhà cung cấp); VIEWER → FORBIDDEN", async () => {
    const a = await item("Vải cotton", "VT-1");
    const port = createCatalogPort(h.deps);
    const set = (await port.ensurePartnerSet(ORG, "SUPPLIER", lesson.partnerName))!;
    seedAlias(h, { id: "ali_ncc", codeSetId: set, code: "2118564ACOT96", codeKey: "2118564ACOT96", itemId: a });
    expect(await proposeLessonAlias(h.deps, declarant, lesson)).toMatchObject({ ok: true, value: { status: "EXISTS", itemId: a } });
    expect(await proposeLessonAlias(h.deps, declarant, { ...lesson, code: "ZZ-9", name: "Đèn lạ", hsCode: "94051199" })).toMatchObject({ ok: true, value: { status: "QUEUED" } });
    expect(h.uow.data.queue).toEqual([expect.objectContaining({ codeSetId: set, code: "ZZ-9", name: "Đèn lạ", status: "PENDING" })]);
    expect((await proposeLessonAlias(h.deps, viewer, lesson)).ok).toBe(false);
  });
});
