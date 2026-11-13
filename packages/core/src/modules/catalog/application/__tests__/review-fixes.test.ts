// Sửa theo review Task 3 (vòng 1): đếm lượt khai theo tờ khai, bí danh của APPROVER, tra mã ARCHIVED/ĐVT, tra lô, gộp khác ĐVT, Decimal, tiền tố, tách, mã nối trùng, hệ số.
import { beforeEach, describe, expect, it } from "vitest";
import { SetupCatalogInputSchema } from "@kb/contracts";
import { decideAlias, moveAlias, proposeAlias } from "../aliases.js";
import { createCatalogPort } from "../catalog-port.js";
import { getCatalogSettings, setupCatalog } from "../code-sets.js";
import { archiveItem, createItem, getItem, updateItem } from "../items.js";
import { mergeItems, splitAliases } from "../merge.js";
import { resolveItem, resolveMany } from "../resolve.js";
import type { CatalogRepos, CatalogUow } from "../ports.js";
import { admin, approver, declarant, makeHarness, ORG, seedOwner, seedSet, viewer, type Harness } from "./_harness.js";

let h: Harness;

async function item(name: string, code: string | undefined, extra: Record<string, unknown> = {}) {
  const r = await createItem(h.deps, admin, { kind: "MATERIAL", name, baseUnit: "MTR", ...(code ? { codeSetId: "cst_kt", code } : {}), ...extra });
  if (!r.ok || r.value.status !== "CREATED") throw new Error(JSON.stringify(r));
  return r.value.item.item.id;
}
const row = (id: string) => h.uow.data.items.find((i) => i.id === id)!;

beforeEach(() => {
  h = makeHarness();
  seedSet(h, { id: "cst_kt", kind: "ACCOUNTING" });
  seedSet(h, { id: "cst_xnk", kind: "CUSTOMS", isDefault: true });
});

describe("1. recordDeclared – một tờ khai cộng một lần mỗi mặt hàng", () => {
  it("2 dòng cùng mặt hàng → +1; dòng của A và B khi A đã gộp vào B → +1", async () => {
    const a = await item("A", "A-1");
    const b = await item("B", "B-1");
    const port = createCatalogPort(h.deps);
    const decl = (itemId: string) => ({ itemId, declarationNo: "100000000001", date: "2026-11-13", typeCode: "A11" });
    expect(await port.recordDeclared(ORG, [decl(a), decl(a)])).toEqual({ updated: 1 });
    expect(row(a).timesDeclared).toBe(1);
    await mergeItems(h.deps, admin, { fromId: a, intoId: b });
    expect(row(b).timesDeclared).toBe(1);
    expect(await port.recordDeclared(ORG, [decl(a), decl(b)])).toEqual({ updated: 1 });
    expect(row(b).timesDeclared).toBe(2);
  });
});

describe("2. createItem – APPROVER không phụ trách bộ: mặt hàng tạo thẳng, bí danh PROPOSED", () => {
  it("bí danh PROPOSED, không chặn CODE_TAKEN; người phụ trách / ADMIN → ACTIVE", async () => {
    const x = await item("X", "VT-1");
    const r = await createItem(h.deps, approver, { kind: "GOODS", name: "Y", codeSetId: "cst_kt", code: "vt 1" });
    expect(r.ok && r.value.status).toBe("CREATED");
    const d = r.ok && r.value.status === "CREATED" ? r.value.item : null;
    expect(d?.aliases.map((a) => [a.codeKey, a.status, a.decidedBy])).toEqual([["VT1", "PROPOSED", null]]);
    expect(h.audits.at(-1)).toMatchObject({ key: "alias:cst_kt:vt 1", newValue: "PROPOSED" });
    // Mã vẫn thuộc X; duyệt bí danh PROPOSED của Y bị chặn.
    expect(await decideAlias(h.deps, admin, d!.aliases[0]!.id, "APPROVE")).toMatchObject({ ok: false, error: { reason: "CATALOG_CODE_TAKEN", details: { itemId: x } } });
    seedOwner(h, "cst_kt", "usr_approver");
    const own = await createItem(h.deps, approver, { kind: "GOODS", name: "Z", codeSetId: "cst_kt", code: "Z-1" });
    expect(own.ok && own.value.status === "CREATED" && own.value.item.aliases[0]!.status).toBe("ACTIVE");
  });
});

describe("3. resolveItem – bí danh cùng bộ", () => {
  it("mặt hàng ARCHIVED không được trả (rơi xuống luật ghép → NONE)", async () => {
    const a = await item("Vải", "VT-1");
    await archiveItem(h.deps, admin, a);
    const r = await resolveItem(h.deps, viewer, { codeSetId: "cst_kt", code: "VT-1" });
    expect(r.ok && r.value).toMatchObject({ itemId: null, level: "NONE" });
  });

  it("ĐVT ≠ ĐVT gốc chưa quy đổi → MAYBE / UNIT_NO_FACTOR (kèm aliasId, ứng viên); có quy đổi → SURE + factor", async () => {
    const a = await item("Vải", "VT-1");
    const r = await resolveItem(h.deps, viewer, { codeSetId: "cst_kt", code: "VT-1", unit: "ROL" });
    expect(r.ok && r.value).toMatchObject({ itemId: null, level: "MAYBE", reason: "UNIT_NO_FACTOR", candidates: [{ itemId: a }] });
    expect(r.ok && r.value.aliasId).toBeTruthy();
    await updateItem(h.deps, admin, a, { conversions: [{ unit: "ROL", factor: "50" }] });
    const s = await resolveItem(h.deps, viewer, { codeSetId: "cst_kt", code: "VT-1", unit: "rol" });
    expect(s.ok && s.value).toMatchObject({ itemId: a, level: "SURE", factor: "50" });
  });
});

describe("4. resolveMany – nạp danh mục một lần cho cả lô", () => {
  it("kết quả đúng thứ tự; một transaction, mỗi bảng đọc một lần", async () => {
    const a = await item("Vải", "VT-1");
    const b = await item("Chỉ", "CH-1");
    let tx = 0;
    const reads: Record<string, number> = {};
    const inner = h.deps.uow;
    const counting: CatalogUow = {
      asOrg: (c, fn) => {
        tx++;
        return inner.asOrg(c, (r) => {
          const wrap = <K extends keyof CatalogRepos>(k: K) =>
            new Proxy(r[k] as object, { get: (t, p) => (typeof (t as Record<string | symbol, unknown>)[p] === "function" ? (...args: unknown[]) => ((reads[`${k}.${String(p)}`] = (reads[`${k}.${String(p)}`] ?? 0) + 1), (t as Record<string | symbol, (...x: unknown[]) => unknown>)[p]!(...args)) : (t as Record<string | symbol, unknown>)[p]) }) as CatalogRepos[K];
          return fn({ ...r, items: wrap("items"), aliases: wrap("aliases"), conversions: wrap("conversions"), codeSets: wrap("codeSets") });
        });
      },
    };
    const deps = { ...h.deps, uow: counting };
    const qs = [{ codeSetId: "cst_kt", code: "CH-1" }, { codeSetId: "cst_kt", code: "LA" }, { codeSetId: "cst_kt", code: "vt 1" }];
    const r = await resolveMany(deps, viewer, qs);
    expect(r.ok && r.value.map((x) => x.itemId)).toEqual([b, null, a]);
    expect(tx).toBe(1);
    expect(reads).toEqual({ "codeSets.list": 1, "items.list": 1, "conversions.listByOrg": 1, "aliases.listByOrg": 1 });
    const port = createCatalogPort(deps);
    expect((await port.resolveMany(ORG, qs)).map((x) => x.level)).toEqual(["SURE", "NONE", "SURE"]);
    expect(await port.resolveMany(ORG, [])).toEqual([]);
  });
});

describe("5. mergeItems – ĐVT", () => {
  it("khác ĐVT gốc, bí danh mang ĐVT nguồn mà đích chưa quy đổi → CATALOG_UNIT_FACTOR_REQUIRED, không đổi gì", async () => {
    const a = await item("Thép", "T-KG", { baseUnit: "KGM" });
    h.uow.data.aliases.find((x) => x.itemId === a)!.unit = "KGM";
    const b = await item("Thép cuộn", "T-M", { baseUnit: "MTR" });
    const before = structuredClone(h.uow.data);
    expect(await mergeItems(h.deps, admin, { fromId: a, intoId: b })).toMatchObject({ ok: false, error: { reason: "CATALOG_UNIT_FACTOR_REQUIRED", details: { unit: "KGM" } } });
    expect(h.uow.data).toEqual(before);
    await updateItem(h.deps, admin, b, { conversions: [{ unit: "kgm", factor: "0.5" }] });
    expect((await mergeItems(h.deps, admin, { fromId: a, intoId: b })).ok).toBe(true);
  });

  it("so ĐVT quy đổi theo itemUnitKey: 'rol' ở đích và 'ROL' ở nguồn không thành hai quy đổi; khác gốc không mang quy đổi sai nghĩa", async () => {
    const a = await item("A", "A-1", { conversions: [{ unit: "ROL", factor: "50" }] });
    const b = await item("B", "B-1", { conversions: [{ unit: "rol", factor: "48" }] });
    await mergeItems(h.deps, admin, { fromId: a, intoId: b });
    expect(h.uow.data.conversions.filter((c) => c.itemId === b).map((c) => [c.unit, c.factor])).toEqual([["rol", "48"]]);
    const c = await item("C", undefined, { baseUnit: "KGM", conversions: [{ unit: "BAG", factor: "25" }] });
    await mergeItems(h.deps, admin, { fromId: c, intoId: b });
    expect(h.uow.data.conversions.filter((x) => x.itemId === b).map((x) => x.unit)).toEqual(["rol"]);
  });

  it("đã gộp A→B thì B→A bị chặn (markMerged có điều kiện)", async () => {
    const a = await item("A", "A-1");
    const b = await item("B", "B-1");
    expect((await mergeItems(h.deps, admin, { fromId: a, intoId: b })).ok).toBe(true);
    expect(await mergeItems(h.deps, admin, { fromId: b, intoId: a })).toMatchObject({ ok: false, error: { reason: "CATALOG_MERGE_INVALID" } });
  });
});

describe("6–10. nhỏ", () => {
  it("6. thuế suất so theo Decimal: '10' → '10.00' không ghi audit", async () => {
    const a = await item("A", undefined);
    await updateItem(h.deps, admin, a, { vatRate: "10" });
    h.audits.length = 0;
    await updateItem(h.deps, admin, a, { vatRate: "10.00", importDutyRate: null });
    expect(h.audits).toEqual([]);
    await updateItem(h.deps, admin, a, { vatRate: "8" });
    expect(h.audits.map((x) => [x.key, x.oldValue, x.newValue])).toEqual([["vatRate", "10", "8"]]);
  });

  it("7. thiết lập lại không nhập tiền tố → giữ tiền tố đã đặt", async () => {
    await setupCatalog(h.deps, admin, SetupCatalogInputSchema.parse({ mode: "PER_DEPARTMENT", prefix: "HH-" }));
    await setupCatalog(h.deps, admin, SetupCatalogInputSchema.parse({ mode: "PER_DEPARTMENT" }));
    const s = await getCatalogSettings(h.deps, viewer);
    expect(s.ok && s.value.itemNoPrefix).toBe("HH-");
    const fresh = makeHarness();
    await setupCatalog(fresh.deps, admin, SetupCatalogInputSchema.parse({ mode: "SHARED" }));
    const f = await getCatalogSettings(fresh.deps, viewer);
    expect(f.ok && f.value.itemNoPrefix).toBe("MH-");
  });

  it("8. tách từ mặt hàng không ACTIVE → CATALOG_MERGE_INVALID; quy đổi chép sang có audit", async () => {
    const a = await item("A", "A-1", { conversions: [{ unit: "ROL", factor: "50" }] });
    const extra = await proposeAlias(h.deps, admin, { itemId: a, codeSetId: "cst_kt", code: "A-R", unit: "ROL" });
    h.audits.length = 0;
    const r = await splitAliases(h.deps, admin, { aliasIds: [extra.ok ? extra.value.id : ""], newItem: { kind: "MATERIAL", name: "A cuộn" } });
    expect(r.ok && r.value.conversions).toEqual([{ unit: "ROL", factor: "50" }]);
    expect(h.audits.map((x) => x.key)).toEqual(["item", "alias:cst_kt:A-R", "alias:cst_kt:A-R", "conv:ROL"]);
    await archiveItem(h.deps, admin, a);
    const first = (await getItem(h.deps, admin, a)).ok ? h.uow.data.aliases.find((x) => x.itemId === a)!.id : "";
    expect(await splitAliases(h.deps, admin, { aliasIds: [first], newItem: { kind: "MATERIAL", name: "z" } })).toMatchObject({ ok: false, error: { reason: "CATALOG_MERGE_INVALID" } });
  });

  it("9. mã nối đã tồn tại (bộ đếm lệch) → cấp số kế tiếp, không báo CATALOG_CODE_TAKEN", async () => {
    const a = await item("A", undefined);
    h.uow.data.settings[0]!.itemNoSeq = 0; // bộ đếm bị lùi
    const b = await item("B", undefined);
    expect([row(a).itemNo, row(b).itemNo]).toEqual(["MH-000001", "MH-000002"]);
  });

  it("10. hệ số sai ở duyệt / chuyển bí danh → VALIDATION", async () => {
    const a = await item("A", "A-1");
    const b = await item("B", "B-1");
    const p = await proposeAlias(h.deps, declarant, { itemId: a, codeSetId: "cst_xnk", code: "X", unit: "ROL" });
    expect(await decideAlias(h.deps, admin, p.ok ? p.value.id : "", "APPROVE", "abc")).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await moveAlias(h.deps, admin, p.ok ? p.value.id : "", b, "0")).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await proposeAlias(h.deps, admin, { itemId: a, codeSetId: "cst_kt", code: "Y", unit: "ROL", factor: "-1" })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});
