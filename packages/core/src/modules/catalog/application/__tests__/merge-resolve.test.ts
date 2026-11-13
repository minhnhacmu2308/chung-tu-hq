import { beforeEach, describe, expect, it } from "vitest";
import { proposeAlias } from "../aliases.js";
import { createCatalogPort } from "../catalog-port.js";
import { createItem, getItem } from "../items.js";
import { mergeItems, splitAliases } from "../merge.js";
import { resolveItem, resolveManyWithItems } from "../resolve.js";
import { admin, approver, makeHarness, ORG, OTHER, otherAdmin, seedSet, viewer, type Harness } from "./_harness.js";

let h: Harness;

async function item(name: string, code: string, extra: Record<string, unknown> = {}) {
  const r = await createItem(h.deps, admin, { kind: "MATERIAL", name, hsCode: "52081100", baseUnit: "MTR", codeSetId: "cst_kt", code, ...extra });
  if (!r.ok || r.value.status !== "CREATED") throw new Error(JSON.stringify(r));
  return r.value.item.item.id;
}
const setTimes = (id: string, n: number, no: string, date: string) => Object.assign(h.uow.data.items.find((i) => i.id === id)!, { timesDeclared: n, lastDeclarationNo: no, lastDeclarationDate: date });

beforeEach(() => {
  h = makeHarness();
  seedSet(h, { id: "cst_kt", kind: "ACCOUNTING" });
  seedSet(h, { id: "cst_xnk", kind: "CUSTOMS", isDefault: true });
  seedSet(h, { id: "cst_ncc", kind: "SUPPLIER", partnerName: "ACME Co., Ltd", partnerKey: "acme co ltd" });
});

describe("mergeItems – Review Focus 3", () => {
  it("gộp A→B rồi B→C: mã cũ của A tra ra C; times_declared cộng dồn; chứng từ cũ trỏ A ra C", async () => {
    const a = await item("Vải A", "A-1");
    const b = await item("Vải B", "B-1");
    const c = await item("Vải C", "C-1");
    setTimes(a, 3, "100000000001", "2026-01-05");
    setTimes(b, 2, "100000000002", "2026-03-01");
    setTimes(c, 1, "100000000003", "2026-02-01");
    expect((await mergeItems(h.deps, admin, { fromId: a, intoId: b })).ok).toBe(true);
    const r = await mergeItems(h.deps, admin, { fromId: b, intoId: c });
    expect(r.ok && [r.value.item.timesDeclared, r.value.item.lastDeclarationNo]).toEqual([6, "100000000002"]);
    expect(r.ok && r.value.aliases.map((x) => x.code).sort()).toEqual(["A-1", "B-1", "C-1"]);

    const res = await resolveItem(h.deps, viewer, { codeSetId: "cst_kt", code: "a 1" });
    expect(res.ok && [res.value.itemId, res.value.level]).toEqual([c, "SURE"]);
    const port = createCatalogPort(h.deps);
    expect(await port.currentItemId(ORG, a)).toBe(c);
    expect(await port.recordDeclared(ORG, [{ itemId: a, declarationNo: "100000000009", date: "2026-11-13", typeCode: "E21" }])).toEqual({ updated: 1 });
    const cd = await getItem(h.deps, admin, c);
    expect(cd.ok && [cd.value.item.timesDeclared, cd.value.item.lastDeclarationNo]).toEqual([7, "100000000009"]);
    const ad = await getItem(h.deps, admin, a);
    expect(ad.ok && [ad.value.item.status, ad.value.item.mergedIntoId]).toEqual(["MERGED", b]);
  });

  it("bí danh trùng (không chuyển được) vẫn tra qua merged_into_id", async () => {
    const a = await item("Vải A", "A-1");
    const b = await item("Vải B", "B-1");
    // PROPOSED cùng (bộ, mã) ở cả A và B → bản ở A không chuyển, ở lại A.
    h.uow.data.aliases.push({ ...h.uow.data.aliases[0]!, id: "ali_pa", code: "P", codeKey: "P", status: "PROPOSED", itemId: a });
    h.uow.data.aliases.push({ ...h.uow.data.aliases[0]!, id: "ali_pb", code: "P", codeKey: "P", status: "PROPOSED", itemId: b });
    await mergeItems(h.deps, admin, { fromId: a, intoId: b });
    expect(h.uow.data.aliases.find((x) => x.id === "ali_pa")!.itemId).toBe(a);
  });

  it("gộp vào chính nó / vào mặt hàng đã gộp / từ mặt hàng đã gộp → CATALOG_MERGE_INVALID; không phải ADMIN → FORBIDDEN; org khác → NOT_FOUND", async () => {
    const a = await item("Vải A", "A-1");
    const b = await item("Vải B", "B-1");
    const c = await item("Vải C", "C-1");
    expect(await mergeItems(h.deps, admin, { fromId: a, intoId: a })).toMatchObject({ ok: false, error: { reason: "CATALOG_MERGE_INVALID" } });
    await mergeItems(h.deps, admin, { fromId: a, intoId: b });
    expect(await mergeItems(h.deps, admin, { fromId: c, intoId: a })).toMatchObject({ ok: false, error: { reason: "CATALOG_MERGE_INVALID" } });
    expect(await mergeItems(h.deps, admin, { fromId: a, intoId: c })).toMatchObject({ ok: false, error: { reason: "CATALOG_MERGE_INVALID" } });
    expect(await mergeItems(h.deps, approver, { fromId: c, intoId: b })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await mergeItems(h.deps, otherAdmin, { fromId: c, intoId: b })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("field_audit gộp: nguồn 1 + đích 1 + mỗi bí danh/quy đổi chuyển 1", async () => {
    const a = await item("Vải A", "A-1", { conversions: [{ unit: "ROL", factor: "50" }] });
    const b = await item("Vải B", "B-1");
    await proposeAlias(h.deps, admin, { itemId: a, codeSetId: "cst_xnk", code: "X-1" });
    h.audits.length = 0;
    await mergeItems(h.deps, admin, { fromId: a, intoId: b });
    expect(h.audits.map((x) => [x.dossierId === a ? "A" : "B", x.key])).toEqual([["A", "status"], ["B", "merge"], ["B", "alias:cst_kt:A-1"], ["B", "alias:cst_xnk:X-1"], ["B", "conv:ROL"]]);
    expect(h.orgAudit.entries.map((e) => e.action)).toEqual(["CATALOG_ITEMS_MERGED"]);
  });
});

describe("splitAliases", () => {
  it("tách một mã sang mặt hàng mới; mặt hàng cũ giữ mã còn lại; audit 1 + 2 mỗi mã", async () => {
    const a = await item("Vải A", "A-1");
    const extra = await proposeAlias(h.deps, admin, { itemId: a, codeSetId: "cst_kt", code: "A-2" });
    h.audits.length = 0;
    const r = await splitAliases(h.deps, admin, { aliasIds: [extra.ok ? extra.value.id : ""], newItem: { kind: "MATERIAL", name: "Vải A loại 2" } });
    expect(r.ok && [r.value.item.itemNo, r.value.item.hsCode, r.value.aliases.map((x) => x.code)]).toEqual(["MH-000002", "52081100", ["A-2"]]);
    const old = await getItem(h.deps, admin, a);
    expect(old.ok && old.value.aliases.map((x) => x.code)).toEqual(["A-1"]);
    expect(h.audits).toHaveLength(3);
    expect(await splitAliases(h.deps, approver, { aliasIds: ["x"], newItem: { kind: "GOODS", name: "z" } })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("resolveItem", () => {
  it("bí danh trong bộ → SURE + aliasId + hệ số; bộ nhận theo tên đối tác; mã ở bộ khác + cùng HS 4 số → SURE(c); không gì → NONE", async () => {
    const a = await item("Vải cotton", "VT-1", { conversions: [{ unit: "ROL", factor: "50" }] });
    await proposeAlias(h.deps, admin, { itemId: a, codeSetId: "cst_ncc", code: "AC-778" });
    const bySupplier = await resolveItem(h.deps, viewer, { partnerName: "ACME CO LTD", code: "ac778", unit: "ROL" });
    expect(bySupplier.ok && bySupplier.value).toMatchObject({ itemId: a, level: "SURE", codeSetId: "cst_ncc", factor: "50" });
    expect(bySupplier.ok && bySupplier.value.aliasId).toBeTruthy();
    const other = await resolveItem(h.deps, viewer, { codeSetId: "cst_xnk", code: "VT 1", hsCode: "5208.12" });
    expect(other.ok && other.value).toMatchObject({ itemId: a, level: "SURE", reason: "CODE_OTHER_SET_HS4" });
    const none = await resolveItem(h.deps, viewer, { codeSetId: "cst_xnk", code: "ZZZ", name: "Máy bơm" });
    expect(none.ok && none.value).toMatchObject({ itemId: null, level: "NONE", candidates: [] });
    const maybe = await resolveItem(h.deps, viewer, { codeSetId: "cst_xnk", code: "VT-1", hsCode: "5208", unit: "KGM" });
    expect(maybe.ok && maybe.value).toMatchObject({ itemId: null, level: "MAYBE", reason: "UNIT_NO_FACTOR" });
    const otherOrg = await resolveItem(h.deps, otherAdmin, { codeSetId: "cst_kt", code: "VT-1" });
    expect(otherOrg.ok && otherOrg.value.level).toBe("NONE");
  });
});

describe("resolveManyWithItems", () => {
  it("nhiều dòng một lần, đúng thứ tự; ứng viên kèm tóm tắt mặt hàng (HS, số lần khai); org khác không thấy; quá 500 dòng → VALIDATION", async () => {
    const a = await item("Vải cotton dệt thoi", "VT-1");
    setTimes(a, 4, "100000000009", "2026-04-01");
    const r = await resolveManyWithItems(h.deps, viewer, [{ name: "Máy bơm nước" }, { name: "vải cotton dệt thoi" }, { name: "x", code: "VT 1", hsCode: "5208" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((x) => x.level)).toEqual(["NONE", "MAYBE", "SURE"]);
    expect(r.value[1]!.candidates[0]).toMatchObject({ itemId: a, item: { id: a, name: "Vải cotton dệt thoi", hsCode: "52081100", timesDeclared: 4 } });
    expect(r.value[2]!.itemId).toBe(a);
    const other = await resolveManyWithItems(h.deps, otherAdmin, [{ name: "vải cotton dệt thoi" }]);
    expect(other.ok && other.value[0]!.candidates).toEqual([]);
    const big = await resolveManyWithItems(h.deps, viewer, Array.from({ length: 501 }, () => ({ name: "x" })));
    expect(!big.ok && big.error.code).toBe("VALIDATION");
  });
});

describe("CatalogPort", () => {
  it("enqueueUnknown: mã đã có trong bộ bỏ qua; mã lạ vào hàng chờ kèm gợi ý; gửi lại không trùng; org khác tách biệt", async () => {
    const a = await item("Vải cotton", "VT-1");
    const port = createCatalogPort(h.deps);
    const rows = [
      { codeSetId: "cst_kt", code: "VT-1", name: "Vải cotton" },
      { codeSetId: "cst_kt", code: "VT-NEW", name: "Vải cotton", hsCode: "52081100", sourceRef: "line:1" },
      { code: "LA-1", name: "Máy lạ" },
    ];
    expect(await port.enqueueUnknown(ORG, rows)).toEqual({ queued: 2 });
    expect(await port.enqueueUnknown(ORG, rows)).toEqual({ queued: 0 });
    expect(h.uow.data.queue.map((q) => [q.codeSetId, q.code, q.level, q.suggestedItemId])).toEqual([["cst_kt", "VT-NEW", "SURE", a], ["cst_xnk", "LA-1", "NONE", null]]);
    expect(await port.enqueueUnknown(OTHER, [{ code: "X", name: "x" }])).toEqual({ queued: 0 }); // org khác không có bộ mặc định
    expect(await port.codeInSet(OTHER, a, "ACCOUNTING")).toBeNull();
    expect(await port.conversionOf(ORG, a)).toEqual({ base: "MTR", factors: {} });
  });

  it("codeInSet: nhiều mã trong bộ → mã mới nhất; CUSTOMS → bộ mặc định", async () => {
    const a = await item("Vải", "OLD");
    h.uow.data.aliases.push({ ...h.uow.data.aliases[0]!, id: "ali_new", code: "NEW", codeKey: "NEW", decidedAt: new Date("2026-12-01T00:00:00Z") });
    h.uow.data.aliases.push({ ...h.uow.data.aliases[0]!, id: "ali_hq", codeSetId: "cst_xnk", code: "HQ-1", codeKey: "HQ1" });
    const port = createCatalogPort(h.deps);
    expect((await port.codeInSet(ORG, a, "ACCOUNTING"))?.code).toBe("NEW");
    expect((await port.codeInSet(ORG, a, "cst_kt"))?.code).toBe("NEW");
    expect((await port.codeInSet(ORG, a, "CUSTOMS"))?.code).toBe("HQ-1");
    expect(await port.codeInSet(ORG, a, "WAREHOUSE")).toBeNull();
  });
});
