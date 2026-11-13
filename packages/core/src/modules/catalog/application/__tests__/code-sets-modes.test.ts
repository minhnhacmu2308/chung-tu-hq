import { beforeEach, describe, expect, it } from "vitest";
import { SetupCatalogInputSchema } from "@kb/contracts";
import { createCatalogPort } from "../catalog-port.js";
import { changeMode, getCatalogSettings, listCodeSets, setOwners, setPrimaryDisplay, setupCatalog, upsertCodeSet } from "../code-sets.js";
import { createItem } from "../items.js";
import { admin, approver, declarant, makeHarness, ORG, otherAdmin, owner, seedAlias, seedSet, viewer, type Harness } from "./_harness.js";

let h: Harness;
const setup = (x: Record<string, unknown>) => SetupCatalogInputSchema.parse(x);
const kinds = async () => {
  const r = await listCodeSets(h.deps, viewer);
  return r.ok ? r.value.map((s) => [s.kind, s.name, s.isDefault, s.isPrimaryDisplay]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) : [];
};

/** Org đã chạy migration: bộ CUSTOMS "XNK" mặc định + một mặt hàng có mã XNK. */
async function migrated() {
  seedSet(h, { id: "cst_xnk", kind: "CUSTOMS", name: "XNK", isDefault: true });
  const r = await createItem(h.deps, admin, { kind: "GOODS", name: "Bulong M8", baseUnit: "PCE", codeSetId: "cst_xnk", code: "BL-M8" });
  if (!r.ok || r.value.status !== "CREATED") throw new Error("seed");
  return r.value.item.item.id;
}

beforeEach(() => {
  h = makeHarness();
});

describe("setupCatalog", () => {
  it("PER_DEPARTMENT: dùng lại bộ XNK từ migration, tạo Kế toán + Kho; chạy 2 lần không nhân đôi", async () => {
    await migrated();
    const input = setup({ mode: "PER_DEPARTMENT", prefix: "HH-", sets: [{ kind: "ACCOUNTING", name: "Kế toán MISA", ownerIds: ["usr_kt"] }], primaryDisplayKind: "ACCOUNTING" });
    expect((await setupCatalog(h.deps, owner, input)).ok).toBe(true);
    expect((await setupCatalog(h.deps, owner, input)).ok).toBe(true);
    expect(await kinds()).toEqual([["ACCOUNTING", "Kế toán MISA", false, true], ["CUSTOMS", "XNK", true, false], ["WAREHOUSE", "Kho", false, false]]);
    const s = await getCatalogSettings(h.deps, viewer);
    expect(s.ok && [s.value.mode, s.value.itemNoPrefix]).toEqual(["PER_DEPARTMENT", "HH-"]);
    const l = await listCodeSets(h.deps, viewer);
    expect(l.ok && l.value.find((x) => x.kind === "ACCOUNTING")!.ownerIds).toEqual(["usr_kt"]);
    expect(h.orgAudit.entries.map((e) => e.action)).toEqual(["CATALOG_SETUP", "CATALOG_SETUP"]);
  });

  it("chỉ ADMIN/OWNER; người phụ trách là VIEWER → VALIDATION; đã thiết lập chế độ khác → CATALOG_MODE_CONFLICT", async () => {
    expect(await setupCatalog(h.deps, approver, setup({ mode: "SHARED" }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await setupCatalog(h.deps, admin, setup({ mode: "SHARED", sets: [{ kind: "SHARED", name: "Mã chung", ownerIds: ["usr_viewer"] }] }))).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await setupCatalog(h.deps, admin, setup({ mode: "SHARED", sets: [{ kind: "WAREHOUSE", name: "Kho" }] }))).toMatchObject({ ok: false, error: { reason: "CATALOG_MODE_CONFLICT" } });
    expect((await setupCatalog(h.deps, admin, setup({ mode: "SHARED" }))).ok).toBe(true);
    expect(await setupCatalog(h.deps, admin, setup({ mode: "PER_DEPARTMENT" }))).toMatchObject({ ok: false, error: { reason: "CATALOG_MODE_CONFLICT" } });
  });
});

describe("chế độ SHARED", () => {
  it("bộ XNK migration → SHARED 'Mã chung' (giữ bí danh); codeInSet CUSTOMS/ACCOUNTING trả mã chung; tạo bộ Kho → CATALOG_MODE_CONFLICT; bộ NCC được", async () => {
    const id = await migrated();
    const r = await setupCatalog(h.deps, admin, setup({ mode: "SHARED", sets: [{ kind: "SHARED", name: "Mã chung", ownerIds: ["usr_kt"] }, { kind: "SUPPLIER", name: "ACME" }] }));
    expect(r.ok).toBe(true);
    expect(await kinds()).toEqual([["SHARED", "Mã chung", true, true], ["SUPPLIER", "ACME", false, false]]);
    const port = createCatalogPort(h.deps);
    expect((await port.codeInSet(ORG, id, "CUSTOMS"))?.code).toBe("BL-M8");
    expect((await port.codeInSet(ORG, id, "ACCOUNTING"))?.code).toBe("BL-M8");
    expect(await upsertCodeSet(h.deps, admin, { kind: "WAREHOUSE", name: "Kho" })).toMatchObject({ ok: false, error: { reason: "CATALOG_MODE_CONFLICT" } });
    expect(await upsertCodeSet(h.deps, admin, { kind: "SHARED", name: "Mã chung 2" })).toMatchObject({ ok: false, error: { reason: "CATALOG_MODE_CONFLICT" } });
    const c = await upsertCodeSet(h.deps, admin, { kind: "CUSTOMER", name: "Khách A", partnerName: "Công ty A" });
    expect(c.ok && [c.value.kind, c.value.partnerKey]).toEqual(["CUSTOMER", "công ty a"]);
  });

  it("changeMode → PER_DEPARTMENT (Mã chung thành Kế toán): giữ nguyên bí danh, tạo bộ XNK mặc định; về SHARED khi còn > 1 bộ nội bộ → CATALOG_MODE_CONFLICT", async () => {
    const id = await migrated();
    await setupCatalog(h.deps, admin, setup({ mode: "SHARED" }));
    const before = structuredClone(h.uow.data.aliases);
    const r = await changeMode(h.deps, admin, { to: "PER_DEPARTMENT", sharedBecomes: "ACCOUNTING" });
    expect(r.ok).toBe(true);
    expect(h.uow.data.aliases).toEqual(before);
    expect(await kinds()).toEqual([["ACCOUNTING", "Kế toán", false, true], ["CUSTOMS", "XNK", true, false]]);
    const port = createCatalogPort(h.deps);
    expect((await port.codeInSet(ORG, id, "ACCOUNTING"))?.code).toBe("BL-M8");
    expect(await port.codeInSet(ORG, id, "CUSTOMS")).toBeNull();
    expect((await upsertCodeSet(h.deps, admin, { kind: "WAREHOUSE", name: "Kho" })).ok).toBe(true);
    expect(await changeMode(h.deps, admin, { to: "SHARED" })).toMatchObject({ ok: false, error: { reason: "CATALOG_MODE_CONFLICT" } });
    const s = await getCatalogSettings(h.deps, viewer);
    expect(s.ok && s.value.mode).toBe("PER_DEPARTMENT");
  });

  it("changeMode Mã chung → XNK giữ mặc định; về SHARED khi chỉ còn 1 bộ nội bộ; quyền + org khác", async () => {
    await migrated();
    await setupCatalog(h.deps, admin, setup({ mode: "SHARED" }));
    expect(await changeMode(h.deps, declarant, { to: "PER_DEPARTMENT", sharedBecomes: "CUSTOMS" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await changeMode(h.deps, admin, { to: "PER_DEPARTMENT", sharedBecomes: "CUSTOMS" })).ok).toBe(true);
    expect(await kinds()).toEqual([["CUSTOMS", "XNK", true, true]]);
    expect((await changeMode(h.deps, admin, { to: "SHARED" })).ok).toBe(true);
    expect(await kinds()).toEqual([["SHARED", "Mã chung", true, true]]);
    expect(h.uow.data.aliases).toHaveLength(1);
    // org khác: không có bộ SHARED của org này → không đụng tới dữ liệu
    expect(await changeMode(h.deps, otherAdmin, { to: "PER_DEPARTMENT", sharedBecomes: "CUSTOMS" })).toMatchObject({ ok: true });
    expect(await kinds()).toEqual([["SHARED", "Mã chung", true, true]]);
  });
});

describe("bộ mã, người phụ trách, mã hiển thị chính", () => {
  it("upsertCodeSet/setOwners/setPrimaryDisplay: chỉ ADMIN/OWNER; người phụ trách phải hợp lệ; org khác → NOT_FOUND", async () => {
    seedSet(h, { id: "cst_kt", kind: "ACCOUNTING", isPrimaryDisplay: true });
    seedAlias(h, { id: "ali_1", codeSetId: "cst_kt", code: "A", codeKey: "A", itemId: "cat_x" });
    expect(await upsertCodeSet(h.deps, approver, { kind: "SUPPLIER", name: "NCC" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const kho = await upsertCodeSet(h.deps, admin, { kind: "WAREHOUSE", name: "Kho", ownerIds: ["usr_kho"], isPrimaryDisplay: true });
    expect(kho.ok && [kho.value.ownerIds, kho.value.isPrimaryDisplay]).toEqual([["usr_kho"], true]);
    expect(await setOwners(h.deps, admin, "cst_kt", ["usr_stranger"])).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const o = await setOwners(h.deps, admin, "cst_kt", ["usr_a", "usr_b"]);
    expect(o.ok && [o.value.ownerIds, o.value.codeCount]).toEqual([["usr_a", "usr_b"], 1]);
    expect(await setOwners(h.deps, otherAdmin, "cst_kt", [])).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await upsertCodeSet(h.deps, otherAdmin, { id: "cst_kt", kind: "ACCOUNTING", name: "x" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const p = await setPrimaryDisplay(h.deps, admin, "cst_kt");
    expect(p.ok && p.value.filter((s) => s.isPrimaryDisplay).map((s) => s.id)).toEqual(["cst_kt"]);
    const none = await setPrimaryDisplay(h.deps, admin, null);
    expect(none.ok && none.value.some((s) => s.isPrimaryDisplay)).toBe(false);
    // Bộ XNK đầu tiên thành mặc định Hải quan.
    const x = await upsertCodeSet(h.deps, admin, { kind: "CUSTOMS", name: "XNK" });
    expect(x.ok && x.value.isDefault).toBe(true);
    expect(await upsertCodeSet(h.deps, admin, { id: "cst_kt", kind: "WAREHOUSE", name: "đổi loại" })).toMatchObject({ ok: false, error: { reason: "CATALOG_MODE_CONFLICT" } });
  });
});

describe("setupCatalog – bộ đối tác đã có (unique org + loại + partner_key)", () => {
  it("ensurePartnerSet đã tự tạo bộ nhà cung cấp → thiết lập dùng lại (không lỗi, không trùng, gán người phụ trách); chạy lại không tạo thêm", async () => {
    await migrated();
    const auto = await createCatalogPort(h.deps).ensurePartnerSet(ORG, "SUPPLIER", "HANSOL PRECISION CO., LTD.");
    const input = setup({ mode: "PER_DEPARTMENT", sets: [{ kind: "SUPPLIER", name: "Hansol Precision Co., Ltd.", ownerIds: ["usr_ncc"] }] });
    expect((await setupCatalog(h.deps, owner, input)).ok).toBe(true);
    expect((await setupCatalog(h.deps, owner, input)).ok).toBe(true);
    const sup = h.uow.data.codeSets.filter((s) => s.kind === "SUPPLIER");
    expect(sup.map((s) => s.id)).toEqual([auto]);
    const l = await listCodeSets(h.deps, viewer);
    expect(l.ok && l.value.find((x) => x.id === auto)!.ownerIds).toEqual(["usr_ncc"]);
  });
});
