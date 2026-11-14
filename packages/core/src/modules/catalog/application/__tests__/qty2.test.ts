// Spec 2026-11-14 (catalog-so-luong-2): ĐVT số lượng 2 + tỷ lệ của mặt hàng – sửa ở khung mặt hàng (field_audit cùng transaction),
// đổi gốc nhân tỷ lệ theo f, tóm tắt cho tờ khai (describeItems.qty2).
import { UpdateItemInputSchema } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { asOrgId } from "../../../../shared/ids.js";
import { createCatalogPort } from "../catalog-port.js";
import { createItem, updateItem } from "../items.js";
import { rebaseItemTo } from "../source-rules.js";
import type { AuditEntry } from "../common.js";
import { admin, approver, declarant, makeHarness, ORG, otherAdmin, seedSet, type Harness } from "./_harness.js";

let h: Harness;
beforeEach(() => {
  h = makeHarness();
  seedSet(h, { id: "cst_xnk", kind: "CUSTOMS", name: "XNK", isDefault: true });
});

async function created() {
  const r = await createItem(h.deps, admin, { kind: "GOODS", name: "Ốc vít", baseUnit: "PCE" });
  if (!r.ok || r.value.status !== "CREATED") throw new Error(JSON.stringify(r));
  h.audits.length = 0;
  return r.value.item.item;
}
const upd = (ctx: Parameters<typeof updateItem>[1], id: string, body: unknown) => updateItem(h.deps, ctx, id, UpdateItemInputSchema.parse(body));

describe("updateItem – ĐVT số lượng 2 + tỷ lệ", () => {
  it("lưu ĐVT 2 + tỷ lệ, mỗi trường một mục field_audit CATALOG_EDIT cùng transaction; DTO trả tỷ lệ gọn", async () => {
    const it0 = await created();
    const r = await upd(approver, it0.id, { qty2Unit: "kgm", qty2Factor: "0.25" });
    expect(r.ok && r.value.item).toMatchObject({ qty2Unit: "KGM", qty2Factor: "0.25" });
    expect(h.audits.map((a) => [a.key, a.oldValue, a.newValue, a.source])).toEqual([["qty2Unit", "", "KGM", "CATALOG_EDIT"], ["qty2Factor", "", "0.25", "CATALOG_EDIT"]]);
    // Gửi lại cùng giá trị (khác cách viết) → không ghi audit thừa.
    h.audits.length = 0;
    expect((await upd(approver, it0.id, { qty2Unit: "KGM", qty2Factor: "0.250" })).ok).toBe(true);
    expect(h.audits).toHaveLength(0);
  });
  it("ĐVT 2 = ĐVT gốc → tỷ lệ 1 (không cần nhập); khác gốc thiếu tỷ lệ → CATALOG_QTY2_FACTOR_REQUIRED, không ghi gì", async () => {
    const it0 = await created();
    const r = await upd(approver, it0.id, { qty2Unit: "PCE" });
    expect(r.ok && r.value.item).toMatchObject({ qty2Unit: "PCE", qty2Factor: "1" });
    h.audits.length = 0;
    const bad = await upd(approver, it0.id, { qty2Unit: "KGM" });
    expect(bad).toMatchObject({ ok: false, error: { code: "VALIDATION", reason: "CATALOG_QTY2_FACTOR_REQUIRED" } });
    expect(h.audits).toHaveLength(0);
    expect(h.uow.data.items.find((i) => i.id === it0.id)).toMatchObject({ qty2Unit: "PCE", qty2Factor: "1" });
  });
  it("bỏ ĐVT 2 → bỏ cả tỷ lệ", async () => {
    const it0 = await created();
    await upd(approver, it0.id, { qty2Unit: "KGM", qty2Factor: "0.25" });
    h.audits.length = 0;
    const r = await upd(approver, it0.id, { qty2Unit: null });
    expect(r.ok && r.value.item).toMatchObject({ qty2Unit: null, qty2Factor: null });
    expect(h.audits.map((a) => a.key)).toEqual(["qty2Unit", "qty2Factor"]);
  });
  it("DECLARANT → FORBIDDEN; org khác → NOT_FOUND, không đổi dữ liệu", async () => {
    const it0 = await created();
    expect(await upd(declarant, it0.id, { qty2Unit: "KGM", qty2Factor: "1" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await upd(otherAdmin, it0.id, { qty2Unit: "KGM", qty2Factor: "1" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(h.uow.data.items.find((i) => i.id === it0.id)).toMatchObject({ qty2Unit: null, qty2Factor: null });
    expect(h.audits).toHaveLength(0);
  });
});

describe("sửa thẳng ĐVT gốc – tỷ lệ ĐVT 2 theo gốc mới", () => {
  it("có quy đổi 1 BOX = 12 PCE → 0.25 KGM/PCE thành 3 KGM/BOX, field_audit cùng lệnh; ĐVT 2 = gốc mới → 1", async () => {
    const it0 = await created();
    await upd(approver, it0.id, { qty2Unit: "KGM", qty2Factor: "0.25", conversions: [{ unit: "BOX", factor: "12" }, { unit: "KGM", factor: "4" }] });
    h.audits.length = 0;
    const r = await upd(approver, it0.id, { baseUnit: "BOX" });
    expect(r.ok && r.value.item).toMatchObject({ baseUnit: "BOX", qty2Unit: "KGM", qty2Factor: "3" });
    expect(h.audits.map((a) => [a.key, a.oldValue, a.newValue])).toEqual([["baseUnit", "PCE", "BOX"], ["qty2Factor", "0.25", "3"]]);
    // ĐVT 2 = gốc mới → tỷ lệ 1 (KGM có quy đổi, nhưng ĐVT 2 = gốc thắng).
    expect((await upd(approver, it0.id, { baseUnit: "KGM" })).ok).toBe(true);
    expect(h.uow.data.items.find((i) => i.id === it0.id)).toMatchObject({ baseUnit: "KGM", qty2Factor: "1" });
  });
  it("không có quy đổi giữa gốc cũ và mới → CATALOG_QTY2_FACTOR_REQUIRED, không ghi gì; gửi kèm tỷ lệ mới → được", async () => {
    const it0 = await created();
    await upd(approver, it0.id, { qty2Unit: "KGM", qty2Factor: "0.25" });
    h.audits.length = 0;
    expect(await upd(approver, it0.id, { baseUnit: "CTN" })).toMatchObject({ ok: false, error: { reason: "CATALOG_QTY2_FACTOR_REQUIRED" } });
    expect(h.uow.data.items.find((i) => i.id === it0.id)).toMatchObject({ baseUnit: "PCE", qty2Factor: "0.25" });
    expect(h.audits).toHaveLength(0);
    const r = await upd(approver, it0.id, { baseUnit: "CTN", qty2Factor: "6" });
    expect(r.ok && r.value.item).toMatchObject({ baseUnit: "CTN", qty2Factor: "6" });
  });
});

describe("đổi gốc – tỷ lệ ĐVT 2 nhân f", () => {
  it("gốc PCE → BOX (1 BOX = 12 PCE): 0.25 KGM/PCE → 3 KGM/BOX, field_audit qty2Factor", async () => {
    const it0 = await created();
    await upd(approver, it0.id, { qty2Unit: "KGM", qty2Factor: "0.25" });
    const row = h.uow.data.items.find((i) => i.id === it0.id)!;
    const audit: AuditEntry[] = [];
    const out = await h.uow.asOrg(admin, (r) => rebaseItemTo(h.deps, r, admin, row, "BOX", audit, "12"));
    expect(out.kind).toBe("REBASED");
    expect(out.item).toMatchObject({ baseUnit: "BOX", qty2Factor: "3" });
    expect(h.uow.data.items.find((i) => i.id === it0.id)).toMatchObject({ baseUnit: "BOX", qty2Unit: "KGM", qty2Factor: "3" });
    expect(audit).toContainEqual({ itemId: it0.id, key: "qty2Factor", oldValue: "0.25", newValue: "3" });
  });
});

describe("describeItems – qty2 cho tờ khai", () => {
  it("tỷ lệ đã chuẩn hóa; ĐVT 2 = gốc → 1; chưa khai → null; org khác không thấy", async () => {
    const a = await created();
    await upd(approver, a.id, { qty2Unit: "KGM", qty2Factor: "0.25" });
    const r = await createItem(h.deps, admin, { kind: "GOODS", name: "Bu lông", baseUnit: "PCE" });
    const b = r.ok && r.value.status === "CREATED" ? r.value.item.item : null;
    const port = createCatalogPort(h.deps);
    const info = await port.describeItems(asOrgId(ORG), [a.id, b!.id]);
    expect(info[a.id]?.qty2).toEqual({ unit: "KGM", factor: "0.25" });
    expect(info[b!.id]?.qty2).toBeNull();
    expect(await port.describeItems(otherAdmin.orgId, [a.id])).toEqual({});
  });
});
