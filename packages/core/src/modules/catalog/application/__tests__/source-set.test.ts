// Spec 2026-11-14 (catalog-nguon-goc-ghep-cot): bộ nguồn gốc, đổi nguồn gốc (xem trước + thực hiện), cột Mã nối, hàng chờ giữ hệ số + thông tin mặt hàng.
import type { ImportRowsInput, ItemImportRow } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { proposeAlias } from "../aliases.js";
import { changeMode, setupCatalog, upsertCodeSet } from "../code-sets.js";
import { importRows } from "../import.js";
import { runMatch } from "../match-run.js";
import type { CatalogItemRow } from "../ports.js";
import { decideQueue, listQueue } from "../queue.js";
import { changeSourceSet, previewSourceChange, SOURCE_REBASE_CHUNK } from "../source.js";
import { admin, ctxOf, declarant, makeHarness, NOW, ORG, OTHER, otherAdmin, seedAlias, seedOwner, seedSet, type Harness } from "./_harness.js";

function seedItem(h: Harness, row: Partial<CatalogItemRow> & { id: string; name: string }, orgId: string = ORG) {
  h.uow.data.items.push({
    orgId, itemNo: `MH-${row.id}`, kind: "GOODS", nameKey: row.name.toLowerCase(), hsCode: null, baseUnit: null, origin: null, tariffSchedule: null, importDutyRate: null,
    vatRate: null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null, description: null, note: null, timesDeclared: 0,
    lastDeclarationNo: null, lastDeclarationDate: null, lastTypeCode: null, status: "ACTIVE", mergedIntoId: null, source: "MANUAL", updatedBy: null, createdAt: NOW, updatedAt: NOW, ...row,
  });
}
const seedConv = (h: Harness, itemId: string, unit: string, factor: string, orgId: string = ORG) =>
  h.uow.data.conversions.push({ id: `ucv_${itemId}_${unit}`, orgId, itemId, unit, factor, createdAt: NOW, updatedAt: NOW });

const ok = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.error)}`);
  return r.value;
};
const input = (codeSetId: string, rows: ItemImportRow[]): ImportRowsInput => ({ codeSetId, fileName: "ds.xlsx", columnMap: { code: 0, name: 1 }, rows });

/** Kế toán (nguồn gốc), Kho, XNK (mặc định), Nhà cung cấp. */
function setup() {
  const h = makeHarness();
  seedSet(h, { id: "acc", kind: "ACCOUNTING", isSource: true });
  seedSet(h, { id: "wh", kind: "WAREHOUSE" });
  seedSet(h, { id: "xnk", kind: "CUSTOMS", isDefault: true });
  seedSet(h, { id: "ncc", kind: "SUPPLIER", partnerName: "NCC", partnerKey: "ncc" });
  return h;
}

/** Thép: gốc KGM, TAN = 1000 KGM, BAO = 50 KGM; mã kho "T1" theo TAN. Ốc: gốc PCE, mã kho "O1" theo BOX chưa có hệ số. Dây: không có mã kho. */
function seedStock(h: Harness) {
  seedItem(h, { id: "thep", name: "Thép", baseUnit: "KGM" });
  seedConv(h, "thep", "TAN", "1000");
  seedConv(h, "thep", "BAO", "50");
  seedAlias(h, { id: "a_t1", codeSetId: "wh", code: "T1", codeKey: "T1", itemId: "thep", unit: "TAN" });
  seedItem(h, { id: "oc", name: "Ốc", baseUnit: "PCE" });
  seedAlias(h, { id: "a_o1", codeSetId: "wh", code: "O1", codeKey: "O1", itemId: "oc", unit: "BOX" });
  seedItem(h, { id: "day", name: "Dây", baseUnit: "MTR" });
  h.uow.data.lines.push(
    { id: "l1", orgId: ORG, dossierId: "dos_1", lineNo: 1, catalogItemId: "thep", unitFactor: "2500" },
    { id: "l2", orgId: ORG, dossierId: "dos_1", lineNo: 2, catalogItemId: "thep", unitFactor: null },
  );
}

describe("xem trước đổi bộ nguồn gốc", () => {
  it("số mặt hàng đổi gốc / giữ nguyên / không có mã + danh sách thiếu hệ số; không ghi gì", async () => {
    const h = setup();
    seedStock(h);
    const p = ok(await previewSourceChange(h.deps, admin, "wh"));
    expect(p).toEqual({
      codeSetId: "wh", currentSourceId: "acc", totalItems: 3, rebaseCount: 1, unchangedCount: 0, missingCount: 1,
      blocked: [{ itemId: "oc", itemNo: "MH-oc", name: "Ốc", code: "O1", baseUnit: "PCE", newUnit: "BOX" }],
    });
    expect(h.uow.data.codeSets.find((s) => s.isSource)?.id).toBe("acc");
    expect(h.audits).toEqual([]);
  });
  it("bộ đối tác → CATALOG_SOURCE_SET_INVALID; không phụ trách → CATALOG_NOT_CODE_SET_OWNER; người phụ trách bộ đích được; org khác → NOT_FOUND", async () => {
    const h = setup();
    expect(await previewSourceChange(h.deps, admin, "ncc")).toMatchObject({ ok: false, error: { reason: "CATALOG_SOURCE_SET_INVALID" } });
    expect(await previewSourceChange(h.deps, declarant, "wh")).toMatchObject({ ok: false, error: { reason: "CATALOG_NOT_CODE_SET_OWNER" } });
    seedOwner(h, "wh", declarant.userId);
    expect((await previewSourceChange(h.deps, declarant, "wh")).ok).toBe(true);
    expect(await previewSourceChange(h.deps, otherAdmin, "wh")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("đổi bộ nguồn gốc", () => {
  it("chuyển cờ, đổi gốc mặt hàng đổi được (quy đổi + hệ số theo lô chia f), field_audit cùng lần; thiếu hệ số giữ nguyên + trả về; org_audit", async () => {
    const h = setup();
    seedStock(h);
    const r = ok(await changeSourceSet(h.deps, admin, { codeSetId: "wh" }));
    expect(r).toMatchObject({ rebased: 1, unchanged: 0, missingCount: 1, changed: true, blocked: [{ itemId: "oc", newUnit: "BOX" }] });
    expect(r.codeSets.filter((s) => s.isSource).map((s) => s.id)).toEqual(["wh"]);
    const thep = h.uow.data.items.find((i) => i.id === "thep")!;
    expect(thep.baseUnit).toBe("TAN");
    expect(h.uow.data.conversions.filter((c) => c.itemId === "thep").map((c) => [c.unit, c.factor]).sort()).toEqual([["BAO", "0.05"], ["KGM", "0.001"]]);
    expect(h.uow.data.lines.map((l) => l.unitFactor)).toEqual(["2.5", null]);
    expect(h.uow.data.items.find((i) => i.id === "oc")!.baseUnit).toBe("PCE");
    const keys = h.audits.filter((a) => a.source === "CATALOG_EDIT").map((a) => `${a.dossierId}|${a.key}|${a.oldValue}|${a.newValue}`);
    expect(keys).toEqual(expect.arrayContaining(["thep|baseUnit|KGM|TAN", "thep|conv:TAN|1000|", "thep|conv:BAO|50|0.05", "thep|conv:KGM||0.001", "dos_1|unitFactor:1|2500|2.5"]));
    expect(h.orgAudit.entries).toEqual([expect.objectContaining({ action: "CATALOG_SOURCE_CHANGED", targetId: "wh", detail: { kind: "WAREHOUSE", changed: true, rebased: 1, blocked: 1 } })]);
  });

  it("bổ sung hệ số rồi 'Áp dụng lại' (cùng endpoint): chỉ mặt hàng còn thiếu được đổi; gọi thêm lần nữa không đổi gì", async () => {
    const h = setup();
    seedStock(h);
    ok(await changeSourceSet(h.deps, admin, { codeSetId: "wh" }));
    seedConv(h, "oc", "BOX", "12");
    const again = ok(await changeSourceSet(h.deps, admin, { codeSetId: "wh" }));
    expect(again).toMatchObject({ rebased: 1, changed: false, blocked: [] });
    expect(h.uow.data.items.find((i) => i.id === "oc")!.baseUnit).toBe("BOX");
    expect(h.uow.data.items.find((i) => i.id === "thep")!.baseUnit).toBe("TAN");
    const n = h.audits.length;
    const third = ok(await changeSourceSet(h.deps, admin, { codeSetId: "wh" }));
    expect(third).toMatchObject({ rebased: 0, unchanged: 2, changed: false, blocked: [] });
    expect(h.audits.length).toBe(n);
    expect(h.orgAudit.entries).toHaveLength(2);
  });

  it("nhiều hơn một lô (> 200 mặt hàng): đổi hết", async () => {
    const h = setup();
    const n = SOURCE_REBASE_CHUNK + 5;
    for (let i = 0; i < n; i++) {
      seedItem(h, { id: `it${i}`, name: `Hàng ${i}`, baseUnit: "PCE" });
      seedConv(h, `it${i}`, "BOX", "10");
      seedAlias(h, { id: `al${i}`, codeSetId: "wh", code: `C${i}`, codeKey: `C${i}`, itemId: `it${i}`, unit: "BOX" });
    }
    expect(ok(await changeSourceSet(h.deps, admin, { codeSetId: "wh" })).rebased).toBe(n);
    expect(h.uow.data.items.every((i) => i.baseUnit === "BOX")).toBe(true);
  });

  it("bộ đối tác → CATALOG_SOURCE_SET_INVALID, không đổi cờ; org khác → NOT_FOUND, dữ liệu org A giữ nguyên; mặt hàng chưa có ĐVT gốc → đặt luôn", async () => {
    const h = setup();
    seedItem(h, { id: "x", name: "X" });
    seedAlias(h, { id: "ax", codeSetId: "wh", code: "X", codeKey: "X", itemId: "x", unit: "SET" });
    expect(await changeSourceSet(h.deps, admin, { codeSetId: "ncc" })).toMatchObject({ ok: false, error: { reason: "CATALOG_SOURCE_SET_INVALID" } });
    expect(await changeSourceSet(h.deps, otherAdmin, { codeSetId: "wh" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(h.uow.data.codeSets.find((s) => s.isSource)?.id).toBe("acc");
    expect(ok(await changeSourceSet(h.deps, admin, { codeSetId: "wh" })).rebased).toBe(1);
    expect(h.uow.data.items[0]!.baseUnit).toBe("SET");
  });

  it("người phụ trách bộ đích (DECLARANT) đổi được; VIEWER/không phụ trách bị từ chối", async () => {
    const h = setup();
    expect(await changeSourceSet(h.deps, ctxOf("VIEWER"), { codeSetId: "wh" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await changeSourceSet(h.deps, declarant, { codeSetId: "wh" })).toMatchObject({ ok: false, error: { reason: "CATALOG_NOT_CODE_SET_OWNER" } });
    seedOwner(h, "wh", declarant.userId);
    expect(ok(await changeSourceSet(h.deps, declarant, { codeSetId: "wh" })).changed).toBe(true);
  });
});

describe("thiết lập / chế độ / bộ mã giữ đúng một bộ nguồn gốc", () => {
  it("PER_DEPARTMENT chọn Kế toán → bộ Kế toán là nguồn gốc; mặc định (không chọn) → XNK; chạy lại không kèm sourceKind giữ nguyên", async () => {
    const h = makeHarness();
    ok(await setupCatalog(h.deps, admin, { mode: "PER_DEPARTMENT", sets: [], sourceKind: "ACCOUNTING" }));
    const src = () => h.uow.data.codeSets.filter((s) => s.isSource).map((s) => s.kind);
    expect(src()).toEqual(["ACCOUNTING"]);
    ok(await setupCatalog(h.deps, admin, { mode: "PER_DEPARTMENT", sets: [] }));
    expect(src()).toEqual(["ACCOUNTING"]);
    const h2 = makeHarness();
    ok(await setupCatalog(h2.deps, admin, { mode: "PER_DEPARTMENT", sets: [] }));
    expect(h2.uow.data.codeSets.filter((s) => s.isSource).map((s) => s.kind)).toEqual(["CUSTOMS"]);
  });
  it("đã có nguồn gốc mà bộ chọn đã có mã → CATALOG_MODE_CONFLICT (dùng đổi bộ nguồn gốc), không ghi gì", async () => {
    const h = makeHarness();
    seedSet(h, { id: "xnk", kind: "CUSTOMS", isDefault: true, isSource: true });
    seedSet(h, { id: "acc", kind: "ACCOUNTING" });
    seedItem(h, { id: "i", name: "I" });
    seedAlias(h, { id: "a", codeSetId: "acc", code: "A", codeKey: "A", itemId: "i" });
    expect(await setupCatalog(h.deps, admin, { mode: "PER_DEPARTMENT", sets: [], sourceKind: "ACCOUNTING" })).toMatchObject({ ok: false, error: { reason: "CATALOG_MODE_CONFLICT", details: { reason: "SOURCE_CHANGE_REQUIRED" } } });
    expect(h.uow.data.codeSets).toHaveLength(2);
    expect(h.uow.data.settings).toEqual([]);
  });
  it("SHARED → bộ Mã chung là nguồn gốc; đổi sang PER_DEPARTMENT giữ nguyên bộ (đổi loại); về SHARED vẫn là nguồn gốc", async () => {
    const h = makeHarness();
    seedSet(h, { id: "xnk", kind: "CUSTOMS", isDefault: true, isSource: true });
    ok(await setupCatalog(h.deps, admin, { mode: "SHARED", sets: [] }));
    expect(h.uow.data.codeSets.filter((s) => s.isSource).map((s) => [s.id, s.kind])).toEqual([["xnk", "SHARED"]]);
    ok(await changeMode(h.deps, admin, { to: "PER_DEPARTMENT", sharedBecomes: "ACCOUNTING" }));
    expect(h.uow.data.codeSets.filter((s) => s.isSource).map((s) => [s.id, s.kind])).toEqual([["xnk", "ACCOUNTING"]]);
    // Bỏ bộ XNK mới tạo để còn đúng một bộ nội bộ rồi về SHARED.
    h.uow.data.codeSets = h.uow.data.codeSets.filter((s) => s.id === "xnk");
    ok(await changeMode(h.deps, admin, { to: "SHARED" }));
    expect(h.uow.data.codeSets.filter((s) => s.isSource).map((s) => [s.id, s.kind])).toEqual([["xnk", "SHARED"]]);
  });
  it("bộ nội bộ đầu tiên tạo khi chưa có nguồn gốc → thành nguồn gốc; bộ đối tác / bộ sau thì không", async () => {
    const h = makeHarness();
    ok(await upsertCodeSet(h.deps, admin, { kind: "SUPPLIER", name: "NCC", partnerName: "NCC" }));
    const kt = ok(await upsertCodeSet(h.deps, admin, { kind: "ACCOUNTING", name: "KT" }));
    const kho = ok(await upsertCodeSet(h.deps, admin, { kind: "WAREHOUSE", name: "Kho" }));
    expect([kt.isSource, kho.isSource]).toEqual([true, false]);
    expect(h.uow.data.codeSets.filter((s) => s.isSource)).toHaveLength(1);
  });
});

describe("nhập file vào bộ nguồn gốc / bộ khác", () => {
  it("bộ nguồn gốc: tên, HS, loại, xuất xứ, thuế của dòng áp vào mặt hàng (field_audit); ĐVT khác gốc + có hệ số → đổi gốc", async () => {
    const h = setup();
    seedItem(h, { id: "v", name: "Vải", baseUnit: "MTR", hsCode: "52081100" });
    seedAlias(h, { id: "av", codeSetId: "acc", code: "V1", codeKey: "V1", itemId: "v", unit: "MTR" });
    const res = ok(await importRows(h.deps, admin, input("acc", [{ code: "V1", name: "Vải cotton", unit: "ROL", factor: "50", hs: "52081200", kind: "Nguyên liệu", origin: "cn", vatRate: "8" }])));
    expect(res.counts).toMatchObject({ matched: 1, queued: 0 });
    const v = h.uow.data.items[0]!;
    expect(v).toMatchObject({ name: "Vải cotton", nameKey: "vải cotton", hsCode: "52081200", kind: "MATERIAL", origin: "CN", vatRate: "8", baseUnit: "ROL" });
    expect(h.uow.data.conversions.filter((c) => c.itemId === "v").map((c) => [c.unit, c.factor])).toEqual([["MTR", "0.02"]]);
    expect(h.audits.map((a) => a.key)).toEqual(expect.arrayContaining(["name", "hsCode", "kind", "origin", "vatRate", "baseUnit", "conv:MTR"]));
  });
  it("bộ không phải nguồn gốc: cột thông tin mặt hàng bị bỏ qua, mặt hàng giữ nguyên; ĐVT khác gốc chỉ thêm quy đổi", async () => {
    const h = setup();
    seedItem(h, { id: "v", name: "Vải", baseUnit: "MTR", hsCode: "52081100" });
    seedAlias(h, { id: "av", codeSetId: "wh", code: "V1", codeKey: "V1", itemId: "v", unit: "MTR" });
    ok(await importRows(h.deps, admin, input("wh", [{ code: "V1", name: "Vải kho", unit: "ROL", factor: "50", kind: "Nguyên liệu", vatRate: "8" }])));
    expect(h.uow.data.items[0]).toMatchObject({ name: "Vải", kind: "GOODS", vatRate: null, baseUnit: "MTR" });
    expect(h.uow.data.conversions.map((c) => [c.unit, c.factor])).toEqual([["ROL", "50"]]);
    expect(h.uow.data.imports[0]!.rows ?? []).toEqual([]);
  });
});

describe("nhập lớn qua job catalog-import giữ trường mới", () => {
  it("> 500 dòng: dòng tạm lưu Mã nối + thông tin mặt hàng (bộ nguồn gốc); runMatch (worker) nối + áp như nhập đồng bộ", async () => {
    const h = setup();
    seedItem(h, { id: "t", name: "Thép", baseUnit: "KGM", itemNo: "MH-000007" });
    const rows: ItemImportRow[] = [{ code: "L1", name: "Thép tấm", linkCode: "MH-000007", kind: "Nguyên liệu", vatRate: "10" }, ...Array.from({ length: 500 }, (_, i) => ({ code: `F${i}`, name: `Hàng lạ ${i}` }))];
    const imp = ok(await importRows(h.deps, admin, input("acc", rows)));
    expect(imp.status).toBe("PARSING");
    expect(h.jobs.jobs.map((j) => j.name)).toEqual(["catalog-import"]);
    expect(h.uow.data.imports[0]!.rows![0]).toMatchObject({ linkCode: "MH-000007", fields: { kind: "MATERIAL", vatRate: "10" } });
    const done = ok(await runMatch(h.deps, admin, imp.id));
    expect(done.counts).toMatchObject({ matched: 1, queued: 500 });
    expect(h.uow.data.items.find((i) => i.id === "t")).toMatchObject({ name: "Thép tấm", kind: "MATERIAL", vatRate: "10" });
  });
});

describe("cột Mã nối", () => {
  function linkSetup() {
    const h = setup();
    seedItem(h, { id: "t", name: "Thép tấm", baseUnit: "KGM", itemNo: "MH-000007" });
    seedAlias(h, { id: "at", codeSetId: "acc", code: "KT-07", codeKey: "KT07", itemId: "t", unit: "KGM" });
    seedItem(h, { id: "o", name: "Ốc", baseUnit: "PCE" });
    return h;
  }
  it("khớp mã nối (không phân biệt hoa thường/khoảng trắng) hoặc mã bộ nguồn gốc → nối thẳng (bỏ qua luật tên/HS)", async () => {
    const h = linkSetup();
    const r = ok(await importRows(h.deps, admin, input("wh", [
      { code: "K1", name: "Tên khác hẳn", unit: "KGM", linkCode: " mh-000007 " },
      { code: "K2", name: "Cũng khác", linkCode: "kt 07" },
    ])));
    expect(r.counts).toMatchObject({ matched: 2, queued: 0 });
    expect(h.uow.data.aliases.filter((a) => a.codeSetId === "wh").map((a) => [a.code, a.itemId])).toEqual([["K1", "t"], ["K2", "t"]]);
  });
  it("mặt hàng đã gộp → mặt hàng cuối chuỗi", async () => {
    const h = linkSetup();
    seedItem(h, { id: "old", name: "Cũ", itemNo: "MH-000001", status: "MERGED", mergedIntoId: "t" });
    ok(await importRows(h.deps, admin, input("wh", [{ code: "K9", name: "x", linkCode: "MH-000001" }])));
    expect(h.uow.data.aliases.find((a) => a.code === "K9")?.itemId).toBe("t");
  });
  it("không khớp → LINK_NOT_FOUND; mã đã ACTIVE cho mặt hàng khác → AMBIGUOUS; ĐVT khác gốc thiếu hệ số → UNIT_NO_FACTOR gợi ý mặt hàng được nối; hàng chờ giữ hệ số", async () => {
    const h = linkSetup();
    seedAlias(h, { id: "ao", codeSetId: "wh", code: "K3", codeKey: "K3", itemId: "o" });
    const r = ok(await importRows(h.deps, admin, input("wh", [
      { code: "K2", name: "x", linkCode: "MH-999999" },
      { code: "K3", name: "y", linkCode: "MH-000007" },
      { code: "K4", name: "z", unit: "TNE", linkCode: "MH-000007" },
    ])));
    expect(r.counts).toMatchObject({ queued: 3, matched: 0 });
    const rows = ok(await listQueue(h.deps, admin, { status: "PENDING", page: 1, pageSize: 50 })).rows;
    expect(rows.map((q) => [q.code, q.level, q.reason, q.suggestedItemId])).toEqual([
      ["K2", "NONE", "LINK_NOT_FOUND", null],
      ["K3", "MAYBE", "AMBIGUOUS", "t"],
      ["K4", "MAYBE", "UNIT_NO_FACTOR", "t"],
    ]);
    expect(rows[2]!.candidates).toEqual([{ itemId: "t", score: 1, reason: "LINKED_BY_CODE" }]);
    expect(h.uow.data.aliases.find((a) => a.code === "K3")?.itemId).toBe("o");
  });
  it("có hệ số → nối luôn + lưu quy đổi; nối vào bộ nguồn gốc → đổi gốc", async () => {
    const h = linkSetup();
    ok(await importRows(h.deps, admin, input("wh", [{ code: "K5", name: "x", unit: "TNE", factor: "1000", linkCode: "MH-000007" }])));
    expect(h.uow.data.conversions.map((c) => [c.itemId, c.unit, c.factor])).toEqual([["t", "TNE", "1000"]]);
    expect(h.uow.data.items.find((i) => i.id === "t")!.baseUnit).toBe("KGM");
    ok(await importRows(h.deps, admin, input("acc", [{ code: "KT-08", name: "Thép tấm", unit: "TNE", linkCode: "MH-000007" }])));
    expect(h.uow.data.items.find((i) => i.id === "t")!.baseUnit).toBe("TNE");
    expect(h.uow.data.conversions.map((c) => [c.itemId, c.unit, c.factor])).toEqual([["t", "KGM", "0.001"]]);
  });
});

describe("hàng chờ giữ hệ số + thông tin mặt hàng", () => {
  it("mục chờ lưu factor + itemFields (bộ nguồn gốc); Tạo mới dùng itemFields; Xác nhận dùng factor của dòng khi không gửi", async () => {
    const h = setup();
    seedItem(h, { id: "g", name: "Găng tay", baseUnit: "PCE" });
    ok(await importRows(h.deps, admin, input("acc", [
      { code: "N1", name: "Hàng mới tinh", unit: "PCE", kind: "Vật tư", origin: "VN", importDutyRate: "5", note: "ghi chú" },
      { code: "N2", name: "Găng tay", unit: "PR", factor: "2", hs: "40151900" },
    ])));
    const rows = ok(await listQueue(h.deps, admin, { status: "PENDING", page: 1, pageSize: 50 })).rows;
    const n1 = rows.find((q) => q.code === "N1")!;
    expect(n1).toMatchObject({ factor: null, itemFields: { name: "Hàng mới tinh", kind: "SUPPLY", origin: "VN", importDutyRate: "5", note: "ghi chú" } });
    ok(await decideQueue(h.deps, admin, n1.id, { action: "CREATE" }));
    expect(h.uow.data.items.find((i) => i.name === "Hàng mới tinh")).toMatchObject({ kind: "SUPPLY", origin: "VN", importDutyRate: "5", note: "ghi chú", baseUnit: "PCE" });

    const n2 = h.uow.data.queue.find((q) => q.code === "N2")!;
    expect(n2.factor).toBe("2");
    // Không gửi hệ số → dùng hệ số của dòng file.
    ok(await decideQueue(h.deps, admin, n2.id, { action: "CHOOSE", itemId: "g" }));
    // Bộ nguồn gốc: ĐVT PR thành gốc (1 PR = 2 PCE), HS của dòng áp vào mặt hàng.
    expect(h.uow.data.items.find((i) => i.id === "g")).toMatchObject({ baseUnit: "PR", hsCode: "40151900" });
    expect(h.uow.data.conversions.filter((c) => c.itemId === "g").map((c) => [c.unit, c.factor])).toEqual([["PCE", "0.5"]]);
  });
  it("bộ không phải nguồn gốc: itemFields null, factor vẫn giữ; xác nhận hàng chờ không đổi gốc", async () => {
    const h = setup();
    seedItem(h, { id: "g", name: "Găng tay", baseUnit: "PCE", hsCode: "40151900" });
    ok(await importRows(h.deps, admin, input("wh", [{ code: "W1", name: "Găng tay", unit: "PR", hs: "40151900", kind: "Vật tư" }])));
    const q = h.uow.data.queue[0]!;
    expect(q).toMatchObject({ reason: "UNIT_NO_FACTOR", factor: null, itemFields: null });
    expect(await decideQueue(h.deps, admin, q.id, { action: "CONFIRM" })).toMatchObject({ ok: false, error: { reason: "CATALOG_UNIT_FACTOR_REQUIRED" } });
    ok(await decideQueue(h.deps, admin, q.id, { action: "CONFIRM", factor: "2" }));
    expect(h.uow.data.items[0]).toMatchObject({ baseUnit: "PCE", kind: "GOODS" });
  });
  it("org khác không thấy / không duyệt được mục chờ", async () => {
    const h = setup();
    ok(await importRows(h.deps, admin, input("acc", [{ code: "Z1", name: "Hàng Z", factor: "3" }])));
    expect(ok(await listQueue(h.deps, otherAdmin, { status: "PENDING", page: 1, pageSize: 50 })).rows).toEqual([]);
    expect(await decideQueue(h.deps, otherAdmin, h.uow.data.queue[0]!.id, { action: "SKIP" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(h.uow.data.queue[0]!.status).toBe("PENDING");
    expect(OTHER).not.toBe(ORG);
  });
});

describe("gắn mã tay vào bộ nguồn gốc", () => {
  it("proposeAlias ACTIVE ĐVT khác gốc + hệ số → đổi gốc mặt hàng; bộ khác chỉ thêm quy đổi", async () => {
    const h = setup();
    seedItem(h, { id: "s", name: "Sơn", baseUnit: "LTR" });
    ok(await proposeAlias(h.deps, admin, { itemId: "s", codeSetId: "wh", code: "S-W", unit: "THUNG", factor: "18" }));
    expect(h.uow.data.items[0]!.baseUnit).toBe("LTR");
    ok(await proposeAlias(h.deps, admin, { itemId: "s", codeSetId: "acc", code: "S-A", unit: "THUNG" }));
    expect(h.uow.data.items[0]!.baseUnit).toBe("THUNG");
    expect(h.uow.data.conversions.map((c) => [c.unit, c.factor])).toEqual([["LTR", "0.055555556"]]);
  });
});
