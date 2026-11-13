import { beforeEach, describe, expect, it } from "vitest";
import { decideAlias, deactivateAlias, moveAlias, proposeAlias } from "../aliases.js";
import { createItem } from "../items.js";
import { admin, ctxOf, declarant, makeHarness, otherAdmin, seedOwner, seedSet, viewer, type Harness } from "./_harness.js";

let h: Harness;
const kt = ctxOf("DECLARANT", "usr_kt"); // người phụ trách bộ Kế toán
const kho = ctxOf("APPROVER", "usr_kho"); // người phụ trách bộ Kho

async function item(name: string, baseUnit = "MTR") {
  const r = await createItem(h.deps, admin, { kind: "MATERIAL", name, baseUnit });
  if (!r.ok || r.value.status !== "CREATED") throw new Error("create");
  return r.value.item.item.id;
}

beforeEach(() => {
  h = makeHarness();
  seedSet(h, { id: "cst_kt", kind: "ACCOUNTING" });
  seedSet(h, { id: "cst_kho", kind: "WAREHOUSE" });
  seedOwner(h, "cst_kt", "usr_kt");
  seedOwner(h, "cst_kho", "usr_kho");
});

describe("proposeAlias / decideAlias", () => {
  it("người phụ trách → ACTIVE ngay; người khác → PROPOSED; duyệt bộ người khác → CATALOG_NOT_CODE_SET_OWNER; người phụ trách duyệt → ACTIVE", async () => {
    const x = await item("Vải");
    const mine = await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "VT-1" });
    expect(mine.ok && mine.value.status).toBe("ACTIVE");
    const p = await proposeAlias(h.deps, declarant, { itemId: x, codeSetId: "cst_kho", code: "K-1", source: "DOCUMENT" });
    expect(p.ok && [p.value.status, p.value.source]).toEqual(["PROPOSED", "DOCUMENT"]);
    const id = p.ok ? p.value.id : "";
    expect(await decideAlias(h.deps, kt, id, "APPROVE")).toMatchObject({ ok: false, error: { code: "FORBIDDEN", reason: "CATALOG_NOT_CODE_SET_OWNER" } });
    expect(await decideAlias(h.deps, viewer, id, "APPROVE")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const ok = await decideAlias(h.deps, kho, id, "APPROVE");
    expect(ok.ok && [ok.value.status, ok.value.decidedBy]).toEqual(["ACTIVE", "usr_kho"]);
    expect(await decideAlias(h.deps, kho, id, "REJECT")).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
  });

  it("ADMIN đề xuất → ACTIVE; VIEWER → FORBIDDEN; đề xuất lại cùng mã → không tạo trùng", async () => {
    const x = await item("Vải");
    expect((await proposeAlias(h.deps, admin, { itemId: x, codeSetId: "cst_kho", code: "K-1" })).ok && h.uow.data.aliases.at(-1)!.status).toBe("ACTIVE");
    expect(await proposeAlias(h.deps, viewer, { itemId: x, codeSetId: "cst_kho", code: "K-2" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    await proposeAlias(h.deps, declarant, { itemId: x, codeSetId: "cst_kt", code: "P-1" });
    await proposeAlias(h.deps, declarant, { itemId: x, codeSetId: "cst_kt", code: "p 1" });
    await proposeAlias(h.deps, admin, { itemId: x, codeSetId: "cst_kho", code: "k1" });
    expect(h.uow.data.aliases).toHaveLength(2);
  });

  it("Review Focus 2: một mặt hàng hai mã (cũ/mới) cùng bộ → hai bí danh ACTIVE; mặt hàng khác cùng mã → CATALOG_CODE_TAKEN, không ghi đè", async () => {
    const x = await item("Vải");
    const y = await item("Chỉ");
    expect((await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "VT-0012" })).ok).toBe(true);
    expect((await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "VT-0012-NEW" })).ok).toBe(true);
    const taken = await proposeAlias(h.deps, kt, { itemId: y, codeSetId: "cst_kt", code: "vt 0012" });
    expect(taken).toMatchObject({ ok: false, error: { code: "DUPLICATE", reason: "CATALOG_CODE_TAKEN", details: { itemId: x } } });
    expect(h.uow.data.aliases.filter((a) => a.status === "ACTIVE").map((a) => [a.itemId, a.codeKey])).toEqual([[x, "VT0012"], [x, "VT0012NEW"]]);
    // Đề xuất cho y trước khi mã bị x giữ → duyệt sau sẽ bị chặn.
    const p = await proposeAlias(h.deps, declarant, { itemId: y, codeSetId: "cst_kho", code: "K-9" });
    await proposeAlias(h.deps, kho, { itemId: x, codeSetId: "cst_kho", code: "K9" });
    expect(await decideAlias(h.deps, kho, p.ok ? p.value.id : "", "APPROVE")).toMatchObject({ ok: false, error: { reason: "CATALOG_CODE_TAKEN" } });
  });

  it("ĐVT khác ĐVT gốc chưa có quy đổi → CATALOG_UNIT_FACTOR_REQUIRED; kèm hệ số → lưu quy đổi", async () => {
    const x = await item("Vải", "MTR");
    expect(await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "VT-R", unit: "ROL" })).toMatchObject({ ok: false, error: { reason: "CATALOG_UNIT_FACTOR_REQUIRED" } });
    expect((await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "VT-R", unit: "ROL", factor: "50" })).ok).toBe(true);
    expect(h.uow.data.conversions.map((c) => [c.unit, c.factor])).toEqual([["ROL", "50"]]);
    const p = await proposeAlias(h.deps, declarant, { itemId: x, codeSetId: "cst_kho", code: "K-KG", unit: "KGM" });
    expect(await decideAlias(h.deps, kho, p.ok ? p.value.id : "", "APPROVE")).toMatchObject({ ok: false, error: { reason: "CATALOG_UNIT_FACTOR_REQUIRED" } });
    expect((await decideAlias(h.deps, kho, p.ok ? p.value.id : "", "APPROVE", "0.2")).ok).toBe(true);
  });

  it("field_audit: ACTIVE 1 mục, PROPOSED 1 mục, duyệt 1 mục, từ chối 1 mục", async () => {
    const x = await item("Vải");
    h.audits.length = 0;
    await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "A" });
    const p1 = await proposeAlias(h.deps, declarant, { itemId: x, codeSetId: "cst_kho", code: "B" });
    const p2 = await proposeAlias(h.deps, declarant, { itemId: x, codeSetId: "cst_kho", code: "C" });
    await decideAlias(h.deps, kho, p1.ok ? p1.value.id : "", "APPROVE");
    await decideAlias(h.deps, kho, p2.ok ? p2.value.id : "", "REJECT");
    expect(h.audits.map((a) => [a.key, a.oldValue, a.newValue])).toEqual([
      ["alias:cst_kt:A", "", "ACTIVE"], ["alias:cst_kho:B", "", "PROPOSED"], ["alias:cst_kho:C", "", "PROPOSED"], ["alias:cst_kho:B", "PROPOSED", "ACTIVE"], ["alias:cst_kho:C", "PROPOSED", "REJECTED"],
    ]);
  });

  it("org khác → NOT_FOUND (không đọc/ghi được bí danh, mặt hàng)", async () => {
    const x = await item("Vải");
    const a = await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "A" });
    const id = a.ok ? a.value.id : "";
    expect(await proposeAlias(h.deps, otherAdmin, { itemId: x, codeSetId: "cst_kt", code: "Z" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await decideAlias(h.deps, otherAdmin, id, "REJECT")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await deactivateAlias(h.deps, otherAdmin, id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await moveAlias(h.deps, otherAdmin, id, x)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(h.uow.data.aliases[0]!.status).toBe("ACTIVE");
  });
});

describe("moveAlias / deactivateAlias", () => {
  it("chuyển sang mặt hàng khác (2 mục audit), ngưng dùng (1 mục) – giải phóng mã cho mặt hàng khác", async () => {
    const x = await item("Vải");
    const y = await item("Vải khác");
    const a = await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "A" });
    const id = a.ok ? a.value.id : "";
    h.audits.length = 0;
    expect(await moveAlias(h.deps, declarant, id, y)).toMatchObject({ ok: false, error: { reason: "CATALOG_NOT_CODE_SET_OWNER" } });
    const m = await moveAlias(h.deps, kt, id, y);
    expect(m.ok && m.value.itemId).toBe(y);
    expect(h.audits.map((e) => e.dossierId)).toEqual([x, y]);
    expect((await deactivateAlias(h.deps, kt, id)).ok).toBe(true);
    expect(h.audits).toHaveLength(3);
    expect((await proposeAlias(h.deps, kt, { itemId: x, codeSetId: "cst_kt", code: "A" })).ok).toBe(true);
  });
});
