import { beforeEach, describe, expect, it } from "vitest";
import { ListCatalogItemsQuerySchema } from "@kb/contracts";
import { archiveItem, createItem, getItem, getItemHistory, listItems, updateItem } from "../items.js";
import { removeConversion, setConversion } from "../conversions.js";
import { exportCrossReference } from "../export.js";
import { admin, approver, ctxOf, declarant, makeHarness, NOW, ORG, otherAdmin, seedAlias, seedOwner, seedSet, viewer, type Harness } from "./_harness.js";

let h: Harness;
const q = (x: Record<string, unknown> = {}) => ListCatalogItemsQuerySchema.parse(x);

beforeEach(() => {
  h = makeHarness();
  seedSet(h, { id: "cst_xnk", kind: "CUSTOMS", name: "XNK", isDefault: true });
  seedSet(h, { id: "cst_kt", kind: "ACCOUNTING", name: "Kế toán", isPrimaryDisplay: true });
  seedOwner(h, "cst_kt", "usr_kt");
});

async function created(ctx = admin, extra: Record<string, unknown> = {}) {
  const r = await createItem(h.deps, ctx, { kind: "MATERIAL", name: "Vải cotton", hsCode: "52081100", baseUnit: "MTR", codeSetId: "cst_kt", code: "vt-0012 ", ...extra });
  if (!r.ok || r.value.status !== "CREATED") throw new Error(JSON.stringify(r));
  return r.value.item;
}

describe("createItem / updateItem / archiveItem", () => {
  it("ADMIN tạo thẳng: mã nối MH-000001, bí danh ACTIVE chuẩn hóa code_key, quy đổi; field_audit 3 mục CATALOG_EDIT", async () => {
    const d = await created(admin, { conversions: [{ unit: "ROL", factor: "50" }] });
    expect(d.item.itemNo).toBe("MH-000001");
    expect(d.aliases).toEqual([expect.objectContaining({ codeSetId: "cst_kt", code: "vt-0012 ", codeKey: "VT0012", status: "ACTIVE" })]);
    expect(d.conversions).toEqual([{ unit: "ROL", factor: "50" }]);
    expect(h.audits.map((a) => a.key)).toEqual(["item", "alias:cst_kt:vt-0012 ", "conv:ROL"]);
    expect(h.audits.every((a) => a.source === "CATALOG_EDIT" && a.dossierId === d.item.id && a.orgId === ORG)).toBe(true);
  });

  it("DECLARANT không phụ trách → vào hàng chờ (NONE), không tạo mặt hàng, không audit", async () => {
    const r = await createItem(h.deps, declarant, { kind: "GOODS", name: "Ốc vít", codeSetId: "cst_kt", code: "OV-1" });
    expect(r.ok && r.value.status).toBe("QUEUED");
    expect(h.uow.data.items).toHaveLength(0);
    expect(h.uow.data.queue).toEqual([expect.objectContaining({ codeSetId: "cst_kt", code: "OV-1", level: "NONE", status: "PENDING" })]);
    expect(h.audits).toHaveLength(0);
  });

  it("DECLARANT là người phụ trách bộ mã → tạo thẳng", async () => {
    const d = await created(ctxOf("DECLARANT", "usr_kt"));
    expect(d.aliases[0]!.status).toBe("ACTIVE");
  });

  it("VIEWER → FORBIDDEN khi tạo/sửa/ngưng; vẫn xem được", async () => {
    const d = await created();
    expect((await createItem(h.deps, viewer, { kind: "GOODS", name: "x" })).ok).toBe(false);
    expect(await updateItem(h.deps, viewer, d.item.id, { name: "y" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await archiveItem(h.deps, viewer, d.item.id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await getItem(h.deps, viewer, d.item.id)).ok).toBe(true);
    expect((await listItems(h.deps, viewer, q())).ok).toBe(true);
  });

  it("mã đã ACTIVE ở mặt hàng khác trong bộ → CATALOG_CODE_TAKEN kèm mặt hàng giữ mã", async () => {
    const d = await created();
    const r = await createItem(h.deps, admin, { kind: "GOODS", name: "Khác", codeSetId: "cst_kt", code: "VT 0012" });
    expect(r).toMatchObject({ ok: false, error: { code: "DUPLICATE", reason: "CATALOG_CODE_TAKEN", details: { itemId: d.item.id, itemNo: "MH-000001" } } });
    expect(h.uow.data.items).toHaveLength(1);
  });

  it("APPROVER sửa thông tin chung: mỗi trường đổi một mục audit; DECLARANT → FORBIDDEN", async () => {
    const d = await created();
    h.audits.length = 0;
    const r = await updateItem(h.deps, approver, d.item.id, { name: "Vải cotton 100%", hsCode: "52081200", note: null });
    expect(r.ok && r.value.item.name).toBe("Vải cotton 100%");
    expect(h.audits.map((a) => [a.key, a.oldValue, a.newValue])).toEqual([["name", "Vải cotton", "Vải cotton 100%"], ["hsCode", "52081100", "52081200"]]);
    expect(await updateItem(h.deps, declarant, d.item.id, { name: "z" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("C7: field_audit ghi qua repo của transaction cùng lệnh sửa (người sửa + giờ theo clock); lỗi trước khi ghi / org khác → không có dòng audit", async () => {
    const d = await created();
    h.audits.length = 0;
    // Lúc callback transaction kết thúc, dòng audit đã có (ghi trong cùng asOrg, không phải port riêng sau commit).
    const seen: number[] = [];
    const real = h.uow.asOrg.bind(h.uow);
    h.deps.uow = { asOrg: (c, fn) => real(c, async (r) => { const out = await fn(r); seen.push(h.audits.length); return out; }) };
    expect((await updateItem(h.deps, approver, d.item.id, { name: "Vải mới" })).ok).toBe(true);
    expect(seen).toEqual([1]);
    expect(h.audits).toEqual([expect.objectContaining({ orgId: ORG, dossierId: d.item.id, key: "name", source: "CATALOG_EDIT", userId: approver.userId, at: NOW })]);
    expect(await updateItem(h.deps, approver, "cat_khong_co", { name: "x" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await updateItem(h.deps, otherAdmin, d.item.id, { name: "x" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(h.audits).toHaveLength(1);
    // Lịch sử đọc qua repo của uow: org khác không thấy.
    expect(await getItemHistory(h.deps, otherAdmin, d.item.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getItemHistory(h.deps, viewer, d.item.id)).toMatchObject({ ok: true, value: [expect.objectContaining({ key: "name", newValue: "Vải mới", userId: approver.userId })] });
  });

  it("ngưng dùng (ADMIN): ARCHIVED, 1 mục audit, ẩn khỏi danh sách mặc định", async () => {
    const d = await created();
    h.audits.length = 0;
    const r = await archiveItem(h.deps, admin, d.item.id);
    expect(r.ok && r.value.item.status).toBe("ARCHIVED");
    expect(h.audits).toEqual([expect.objectContaining({ key: "status", oldValue: "ACTIVE", newValue: "ARCHIVED" })]);
    const l = await listItems(h.deps, admin, q());
    expect(l.ok && l.value.total).toBe(0);
    expect(await archiveItem(h.deps, approver, d.item.id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("org khác → NOT_FOUND, danh sách rỗng", async () => {
    const d = await created();
    expect(await getItem(h.deps, otherAdmin, d.item.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await updateItem(h.deps, otherAdmin, d.item.id, { name: "hack" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await archiveItem(h.deps, otherAdmin, d.item.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await setConversion(h.deps, otherAdmin, d.item.id, "KGM", "2")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const l = await listItems(h.deps, otherAdmin, q());
    expect(l.ok && l.value.total).toBe(0);
    expect(h.uow.data.items[0]!.name).toBe("Vải cotton");
  });
});

describe("listItems", () => {
  it("tìm theo mọi mã / mã nối / tên; xem theo bộ mã; lọc thiếu mã XNK / thiếu quy đổi", async () => {
    const a = await created();
    const b = await created(admin, { name: "Chỉ may", hsCode: "54011000", baseUnit: "KGM", code: "CM-1" });
    seedAlias(h, { id: "ali_x", codeSetId: "cst_xnk", code: "XNK-01", codeKey: "XNK01", itemId: a.item.id });
    seedAlias(h, { id: "ali_r", codeSetId: "cst_kt", code: "CM-ROLL", codeKey: "CMROLL", itemId: b.item.id, unit: "ROL", decidedAt: new Date("2025-01-01T00:00:00Z") });

    const byCode = await listItems(h.deps, viewer, q({ q: "xnk 01" }));
    expect(byCode.ok && byCode.value.rows.map((r) => r.id)).toEqual([a.item.id]);
    const byNo = await listItems(h.deps, viewer, q({ q: "mh-000002" }));
    expect(byNo.ok && byNo.value.rows.map((r) => r.id)).toEqual([b.item.id]);
    const byName = await listItems(h.deps, viewer, q({ q: "chi may" }));
    expect(byName.ok && byName.value.rows.map((r) => r.id)).toEqual([b.item.id]);

    const inSet = await listItems(h.deps, viewer, q({ codeSetId: "cst_xnk" }));
    expect(inSet.ok && inSet.value.rows.map((r) => [r.displayCode, r.setCode])).toEqual([["vt-0012 ", "XNK-01"], ["CM-1", null]]);

    const noCustoms = await listItems(h.deps, viewer, q({ missingCustoms: "true" }));
    expect(noCustoms.ok && noCustoms.value.rows.map((r) => r.id)).toEqual([b.item.id]);
    const noFactor = await listItems(h.deps, viewer, q({ missingFactor: "1" }));
    expect(noFactor.ok && noFactor.value.rows.map((r) => r.id)).toEqual([b.item.id]);
    await setConversion(h.deps, admin, b.item.id, "ROL", "25.5");
    const fixed = await listItems(h.deps, viewer, q({ missingFactor: "true" }));
    expect(fixed.ok && fixed.value.total).toBe(0);
    const paged = await listItems(h.deps, viewer, q({ pageSize: 1, page: 2 }));
    expect(paged.ok && [paged.value.total, paged.value.rows.length]).toEqual([2, 1]);
  });

  it("codeSetId không có → NOT_FOUND", async () => {
    expect(await listItems(h.deps, admin, q({ codeSetId: "cst_none" }))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("quy đổi đơn vị", () => {
  it("thêm/sửa/xóa ghi audit; ĐVT gốc → VALIDATION; hệ số sai → VALIDATION", async () => {
    const d = await created();
    h.audits.length = 0;
    expect((await setConversion(h.deps, approver, d.item.id, "ROL", "50")).ok).toBe(true);
    expect((await setConversion(h.deps, approver, d.item.id, "ROL", "50")).ok).toBe(true); // không đổi → không audit
    expect((await setConversion(h.deps, approver, d.item.id, "ROL", "48.5")).ok).toBe(true);
    expect((await removeConversion(h.deps, approver, d.item.id, "rol")).ok).toBe(true);
    expect(h.audits.map((a) => [a.key, a.oldValue, a.newValue])).toEqual([["conv:ROL", "", "50"], ["conv:ROL", "50", "48.5"], ["conv:ROL", "48.5", ""]]);
    expect(await setConversion(h.deps, approver, d.item.id, "mtr", "2")).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await setConversion(h.deps, approver, d.item.id, "KGM", "0")).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("DECLARANT không phụ trách bộ nào → CATALOG_NOT_CODE_SET_OWNER; người phụ trách → được", async () => {
    const d = await created();
    expect(await setConversion(h.deps, declarant, d.item.id, "ROL", "50")).toMatchObject({ ok: false, error: { code: "FORBIDDEN", reason: "CATALOG_NOT_CODE_SET_OWNER" } });
    expect((await setConversion(h.deps, ctxOf("DECLARANT", "usr_kt"), d.item.id, "ROL", "50")).ok).toBe(true);
    expect(await setConversion(h.deps, viewer, d.item.id, "ROL", "50")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("exportCrossReference", () => {
  it("mỗi mã nối một dòng: mã theo id bộ, hệ số; VIEWER được xuất", async () => {
    const d = await created(admin, { conversions: [{ unit: "ROL", factor: "50" }] });
    seedAlias(h, { id: "ali_x", codeSetId: "cst_xnk", code: "XNK-01", codeKey: "XNK01", itemId: d.item.id });
    seedAlias(h, { id: "ali_x2", codeSetId: "cst_xnk", code: "XNK-01B", codeKey: "XNK01B", itemId: d.item.id });
    const r = await exportCrossReference(h.deps, viewer);
    expect(r.ok && r.value.rows).toEqual([{ itemNo: "MH-000001", name: "Vải cotton", hs: "52081100", baseUnit: "MTR", codes: { cst_kt: ["vt-0012 "], cst_xnk: ["XNK-01", "XNK-01B"] }, factors: { ROL: "50" } }]);
    expect(r.ok && r.value.codeSets.map((s) => s.id).sort()).toEqual(["cst_kt", "cst_xnk"]);
    const o = await exportCrossReference(h.deps, otherAdmin);
    expect(o.ok && o.value.rows).toEqual([]);
  });
});

describe("getItemHistory", () => {
  it("đọc field_audit CATALOG_EDIT của mặt hàng (mới nhất trước), mọi vai trò xem được; org khác → NOT_FOUND", async () => {
    const d = await created();
    await updateItem(h.deps, approver, d.item.id, { name: "Vải cotton 100%" });
    const r = await getItemHistory(h.deps, viewer, d.item.id);
    expect(r.ok).toBe(true);
    const rows = r.ok ? r.value : [];
    expect(rows.map((x) => x.key)).toEqual(["name", "alias:cst_kt:vt-0012 ", "item"]);
    expect(rows[0]).toEqual({ key: "name", oldValue: "Vải cotton", newValue: "Vải cotton 100%", userId: "usr_approver", at: NOW.toISOString() });
    expect(await getItemHistory(h.deps, otherAdmin, d.item.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
