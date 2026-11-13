// Task 4: nhập Excel → ghép → hàng chờ duyệt; nhập lớn qua job catalog-import; lấy từ chứng từ đã đọc.
import type { ImportRowsInput, ItemImportRow } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { importFromDocuments } from "../from-documents.js";
import { getImport, importRows } from "../import.js";
import { runMatch } from "../match-run.js";
import { decideQueue, decideQueueBulk, listQueue } from "../queue.js";
import type { CatalogItemRow } from "../ports.js";
import { admin, ctxOf, declarant, makeHarness, NOW, ORG, otherAdmin, seedAlias, seedOwner, seedSet, viewer, type Harness } from "./_harness.js";

const input = (codeSetId: string, rows: ItemImportRow[], fileName = "ds.xlsx"): ImportRowsInput => ({ codeSetId, fileName, columnMap: { code: 0, name: 1, unit: 2, hs: 3 }, rows });

function seedItem(h: Harness, row: Partial<CatalogItemRow> & { id: string; name: string }) {
  h.uow.data.items.push({
    orgId: ORG, itemNo: `MH-${row.id}`, kind: "GOODS", nameKey: row.name.toLowerCase(), hsCode: null, baseUnit: null, origin: null, tariffSchedule: null, importDutyRate: null,
    vatRate: null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null, description: null, note: null, timesDeclared: 0,
    lastDeclarationNo: null, lastDeclarationDate: null, lastTypeCode: null, status: "ACTIVE", mergedIntoId: null, source: "MANUAL", updatedBy: null, createdAt: NOW, updatedAt: NOW, ...row,
  });
}

function setup() {
  const h = makeHarness();
  seedSet(h, { id: "acc", kind: "ACCOUNTING" });
  seedSet(h, { id: "wh", kind: "WAREHOUSE" });
  seedSet(h, { id: "xnk", kind: "CUSTOMS", isDefault: true });
  return h;
}

const ok = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.error)}`);
  return r.value;
};

describe("importRows + runMatch", () => {
  it("quá 5.000 dòng một lần gửi → CATALOG_IMPORT_TOO_LARGE {max}, không ghi lần nhập", async () => {
    const h = setup();
    const rows = Array.from({ length: 5_001 }, (_, i) => ({ code: `Z${i}`, name: `Hàng ${i}` }));
    const r = await importRows(h.deps, admin, input("acc", rows));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "VALIDATION", reason: "CATALOG_IMPORT_TOO_LARGE", params: { max: 5_000 } });
    expect(h.uow.data.imports).toEqual([]);
  });

  it("Review Focus 1: mã kế toán viết khác ('vt-0012 ') và mã kho ('VT 0012') → một mặt hàng, hai bộ mã", async () => {
    const h = setup();
    const acc = ok(await importRows(h.deps, admin, input("acc", [{ code: "vt-0012 ", name: "Vải cotton 100%", unit: "MTR", hs: "5208.11.00" }])));
    expect(acc.status).toBe("DONE");
    expect(acc.counts).toMatchObject({ queued: 1, matched: 0, errors: 0 });
    const q = ok(await listQueue(h.deps, admin, { status: "PENDING", page: 1, pageSize: 50 })).rows;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ level: "NONE", code: "vt-0012 ".trim(), importId: acc.id });
    ok(await decideQueue(h.deps, admin, q[0]!.id, { action: "CREATE" }));
    expect(h.uow.data.items).toHaveLength(1);
    expect(ok(await getImport(h.deps, admin, acc.id)).counts).toMatchObject({ created: 1, queued: 0 });

    const wh = ok(await importRows(h.deps, admin, input("wh", [{ code: "VT 0012", name: "Vai cotton kho", unit: "MTR", hs: "52081100" }])));
    expect(wh.counts).toMatchObject({ matched: 1, queued: 0 });
    expect(h.uow.data.items).toHaveLength(1);
    const aliases = h.uow.data.aliases.filter((a) => a.status === "ACTIVE");
    expect(aliases.map((a) => [a.codeSetId, a.codeKey]).sort()).toEqual([["acc", "VT0012"], ["wh", "VT0012"]]);
    expect(new Set(aliases.map((a) => a.itemId)).size).toBe(1);
    // field_audit theo mặt hàng: tạo mặt hàng + 2 bí danh.
    expect(h.audits.filter((a) => a.dossierId === aliases[0]!.itemId && a.source === "CATALOG_EDIT").length).toBeGreaterThanOrEqual(3);
  });

  it("nhập lại cùng file → 0 mặt hàng mới, 0 mục chờ mới; mã đã có trong bộ → cập nhật tên/ĐVT bí danh", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Chỉ may", baseUnit: "ROL" });
    seedAlias(h, { id: "a1", codeSetId: "acc", code: "CM-01", codeKey: "CM01", itemId: "i1", name: "Chỉ may", unit: "ROL" });
    const rows = [
      { code: "cm 01", name: "Chỉ may polyester", unit: "ROL" },
      { code: "ZZ-9", name: "Hàng hoàn toàn mới", unit: "PCE" },
    ];
    const first = ok(await importRows(h.deps, admin, input("acc", rows)));
    expect(first.counts).toMatchObject({ matched: 1, queued: 1 });
    expect(h.uow.data.aliases.find((a) => a.id === "a1")!.name).toBe("Chỉ may polyester");
    expect(h.audits.some((a) => a.dossierId === "i1" && a.newValue === "Chỉ may polyester")).toBe(true);
    const second = ok(await importRows(h.deps, admin, input("acc", rows)));
    // Mã ZZ-9 đã chờ duyệt sẵn → skipped; tổng các nhóm = số dòng hợp lệ.
    expect(second.counts).toEqual({ matched: 1, queued: 0, created: 0, skipped: 1, errors: 0 });
    const c = second.counts;
    expect(c.created + c.matched + c.queued + c.skipped).toBe(second.progress.total);
    expect(h.uow.data.items).toHaveLength(1);
    expect(h.uow.data.queue).toHaveLength(1);
    expect(h.uow.data.imports.every((i) => i.rows === null)).toBe(true);
  });

  it("dòng MAYBE vào hàng chờ kèm lý do + gợi ý; dòng lỗi ghi theo dòng, dòng khác vẫn nhập", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Vải cotton trắng khổ 1m6", nameKey: "vai cotton trang kho 1m6", hsCode: "52081100", baseUnit: "MTR" });
    const r = ok(await importRows(h.deps, admin, input("acc", [
      { code: "X1", name: "Vải cotton trắng khổ 1m6 loại tốt", unit: "MTR" },
      { code: "", name: "Thiếu mã" },
      { code: "X2", name: "Sai HS", hs: "12ab" },
      { code: "X3", name: "ĐVT lạ", unit: "CÁI" },
    ])));
    expect(r.counts).toMatchObject({ queued: 1, errors: 3 });
    expect(r.errors).toEqual([{ row: 2, field: "code", code: "MISSING" }, { row: 3, field: "hs", code: "INVALID_FORMAT" }, { row: 4, field: "unit", code: "UNKNOWN_UNIT" }]);
    const q = h.uow.data.queue[0]!;
    expect(q).toMatchObject({ level: "MAYBE", reason: "NAME_SIMILAR_CHAPTER", suggestedItemId: "i1", importRow: 1, status: "PENDING" });
    expect(q.candidates[0]).toMatchObject({ itemId: "i1" });
  });

  it("Review Focus 2: hai dòng cùng file (mã cũ/mới) cùng HS 8 số + tên → một mặt hàng, hai bí danh ACTIVE", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Bulong M8", nameKey: "bulong m8", hsCode: "73181510", baseUnit: "PCE" });
    const r = ok(await importRows(h.deps, admin, input("acc", [
      { code: "BL-OLD", name: "Bulong M8", unit: "PCE", hs: "73181510" },
      { code: "BL-NEW", name: "Bulong M8", unit: "PCE", hs: "73181510" },
    ])));
    expect(r.counts).toMatchObject({ matched: 2, queued: 0 });
    expect(h.uow.data.aliases.filter((a) => a.itemId === "i1" && a.status === "ACTIVE").map((a) => a.codeKey).sort()).toEqual(["BLNEW", "BLOLD"]);
  });

  it("SURE nhưng khác ĐVT gốc: file có cột Quy đổi → ghép + lưu quy đổi; không có → MAYBE UNIT_NO_FACTOR", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Bulong M8", nameKey: "bulong m8", hsCode: "73181510", baseUnit: "PCE" });
    const r = ok(await importRows(h.deps, admin, { ...input("acc", [{ code: "B1", name: "Bulong M8", unit: "SET", hs: "73181510", factor: "100" }]), columnMap: { code: 0, name: 1, unit: 2, hs: 3, factor: 4 } }));
    expect(r.counts).toMatchObject({ matched: 1 });
    expect(h.uow.data.conversions).toEqual([expect.objectContaining({ itemId: "i1", unit: "SET", factor: "100" })]);
    const r2 = ok(await importRows(h.deps, admin, input("wh", [{ code: "B2", name: "Bulong M8", unit: "KGM", hs: "73181510" }])));
    expect(r2.counts).toMatchObject({ queued: 1 });
    expect(h.uow.data.queue[0]).toMatchObject({ level: "MAYBE", reason: "UNIT_NO_FACTOR", suggestedItemId: "i1" });
  });

  it("> 500 dòng → ghi PARSING + xếp job catalog-import; worker (runMatch) chạy xong counts đúng, chạy lại không trùng", async () => {
    const h = setup();
    const rows = Array.from({ length: 600 }, (_, i) => ({ code: `C${i + 1}`, name: `Mặt hàng số ${i + 1} kiểu ${String.fromCharCode(97 + (i % 26))}${i}`, unit: "PCE" }));
    const imp = ok(await importRows(h.deps, admin, input("acc", rows)));
    expect(imp.status).toBe("PARSING");
    expect(imp.progress).toEqual({ done: 0, total: 600 });
    expect(h.jobs.jobs).toEqual([{ name: "catalog-import", payload: { orgId: ORG, userId: admin.userId, importId: imp.id }, jobId: `catalog-import:${imp.id}` }]);
    expect(h.uow.data.imports[0]!.rows).toHaveLength(600);
    expect(h.uow.data.queue).toHaveLength(0);

    const done = ok(await runMatch(h.deps, { orgId: ORG, userId: admin.userId }, imp.id));
    expect(done.status).toBe("DONE");
    expect(done.counts).toEqual({ created: 0, matched: 0, queued: 600, skipped: 0, errors: 0 });
    expect(done.progress).toEqual({ done: 600, total: 600 });
    expect(h.uow.data.imports[0]!.rows).toBeNull();
    expect(new Set(h.uow.data.queue.map((q) => q.importRow)).size).toBe(600);

    const again = ok(await runMatch(h.deps, { orgId: ORG, userId: admin.userId }, imp.id));
    expect(again.counts.queued).toBe(600);
    expect(h.uow.data.queue).toHaveLength(600);
  });

  it("runMatch tiếp tục từ dòng đã ghép (idempotent theo (import, dòng)) khi job chạy lại giữa chừng", async () => {
    const h = setup();
    const rows = Array.from({ length: 501 }, (_, i) => ({ code: `D${i}`, name: `Hàng ${i} loại ${i * 7}`, unit: "PCE" }));
    const imp = ok(await importRows(h.deps, admin, input("acc", rows)));
    // Giả lập lần chạy trước đã xong 200 dòng đầu.
    h.uow.data.imports[0]!.rowsDone = 200;
    h.uow.data.imports[0]!.counts.queued = 200;
    const done = ok(await runMatch(h.deps, { orgId: ORG, userId: admin.userId }, imp.id));
    expect(done.counts.queued).toBe(501);
    expect(h.uow.data.queue).toHaveLength(301);
    expect(Math.min(...h.uow.data.queue.map((q) => q.importRow!))).toBe(201);
  });

  it("quyền: người không phụ trách bộ → CATALOG_NOT_CODE_SET_OWNER; VIEWER → FORBIDDEN; người phụ trách nhập được", async () => {
    const h = setup();
    const r = await importRows(h.deps, declarant, input("acc", [{ code: "A", name: "A" }]));
    expect(r.ok ? null : r.error.reason).toBe("CATALOG_NOT_CODE_SET_OWNER");
    const v = await importRows(h.deps, viewer, input("acc", [{ code: "A", name: "A" }]));
    expect(v.ok ? null : v.error.code).toBe("FORBIDDEN");
    expect(h.uow.data.imports).toHaveLength(0);
    seedOwner(h, "acc", declarant.userId);
    expect((await importRows(h.deps, declarant, input("acc", [{ code: "A", name: "A" }]))).ok).toBe(true);
  });

  it("org khác không thấy lần nhập / hàng chờ của org này", async () => {
    const h = setup();
    const imp = ok(await importRows(h.deps, admin, input("acc", [{ code: "A", name: "Hàng A" }])));
    expect((await getImport(h.deps, otherAdmin, imp.id)).ok).toBe(false);
    expect(ok(await listQueue(h.deps, otherAdmin, { status: "PENDING", page: 1, pageSize: 50 })).total).toBe(0);
    const d = await decideQueue(h.deps, otherAdmin, h.uow.data.queue[0]!.id, { action: "SKIP" });
    expect(d.ok ? null : d.error.code).toBe("NOT_FOUND");
    expect((await runMatch(h.deps, { orgId: otherAdmin.orgId, userId: otherAdmin.userId }, imp.id)).ok).toBe(false);
    expect((await importRows(h.deps, otherAdmin, input("acc", [{ code: "A", name: "A" }]))).ok).toBe(false);
  });
});

describe("decideQueue / decideQueueBulk / listQueue", () => {
  async function maybeRow(h: Harness, unit = "MTR") {
    seedItem(h, { id: "i1", name: "Vải cotton trắng khổ 1m6", nameKey: "vai cotton trang kho 1m6", hsCode: "52081100", baseUnit: "MTR" });
    ok(await importRows(h.deps, admin, input("acc", [{ code: "X1", name: "Vải cotton trắng khổ 1m6 loại tốt", unit }])));
    return h.uow.data.queue[0]!;
  }

  it("CONFIRM khác ĐVT gốc mà thiếu hệ số → CATALOG_UNIT_FACTOR_REQUIRED, mục vẫn PENDING; có hệ số → bí danh ACTIVE + quy đổi", async () => {
    const h = setup();
    const q = await maybeRow(h, "ROL");
    const bad = await decideQueue(h.deps, admin, q.id, { action: "CONFIRM" });
    expect(bad.ok ? null : bad.error.reason).toBe("CATALOG_UNIT_FACTOR_REQUIRED");
    expect(h.uow.data.queue[0]!.status).toBe("PENDING");
    expect(h.uow.data.aliases).toHaveLength(0);
    const good = ok(await decideQueue(h.deps, admin, q.id, { action: "CONFIRM", factor: "50" }));
    expect(good).toMatchObject({ status: "DONE", suggestedItemId: "i1", decidedBy: admin.userId });
    expect(h.uow.data.aliases).toEqual([expect.objectContaining({ itemId: "i1", codeKey: "X1", status: "ACTIVE", source: "IMPORT", unit: "ROL" })]);
    expect(h.uow.data.conversions).toEqual([expect.objectContaining({ itemId: "i1", unit: "ROL", factor: "50" })]);
    expect(ok(await getImport(h.deps, admin, q.importId!)).counts).toMatchObject({ matched: 1, queued: 0 });
  });

  it("quyết định 2 lần → CATALOG_QUEUE_ITEM_DONE (cả sau SKIP)", async () => {
    const h = setup();
    const q = await maybeRow(h);
    ok(await decideQueue(h.deps, admin, q.id, { action: "CONFIRM" }));
    const again = await decideQueue(h.deps, admin, q.id, { action: "CREATE" });
    expect(again.ok ? null : again.error.reason).toBe("CATALOG_QUEUE_ITEM_DONE");
    expect(h.uow.data.items).toHaveLength(1);

    const h2 = setup();
    const q2 = await maybeRow(h2);
    expect(ok(await decideQueue(h2.deps, admin, q2.id, { action: "SKIP" })).status).toBe("SKIPPED");
    expect(ok(await getImport(h2.deps, admin, q2.importId!)).counts).toMatchObject({ queued: 0, skipped: 1 });
    const r = await decideQueue(h2.deps, admin, q2.id, { action: "SKIP" });
    expect(r.ok ? null : r.error.reason).toBe("CATALOG_QUEUE_ITEM_DONE");
  });

  it("CHOOSE mặt hàng khác khi mã đã trỏ mặt hàng khác trong bộ → CATALOG_CODE_TAKEN, không ghi đè", async () => {
    const h = setup();
    const q = await maybeRow(h);
    seedItem(h, { id: "i2", name: "Vải khác" });
    seedItem(h, { id: "i3", name: "Vải thứ ba" });
    seedAlias(h, { id: "held", codeSetId: "acc", code: "X1", codeKey: "X1", itemId: "i2" });
    const r = await decideQueue(h.deps, admin, q.id, { action: "CHOOSE", itemId: "i3" });
    expect(r.ok ? null : r.error.reason).toBe("CATALOG_CODE_TAKEN");
    expect(h.uow.data.queue[0]!.status).toBe("PENDING");
    expect(h.uow.data.aliases.find((a) => a.id === "held")!.itemId).toBe("i2");
    const noItem = await decideQueue(h.deps, admin, q.id, { action: "CHOOSE" });
    expect(noItem.ok ? null : noItem.error.code).toBe("VALIDATION");
  });

  it("CREATE / CONFIRM mục NONE → mặt hàng mới có mã nối + bí danh ACTIVE; ĐVT dòng là ĐVT gốc", async () => {
    const h = setup();
    ok(await importRows(h.deps, admin, input("acc", [{ code: "N-1", name: "Hàng mới một", unit: "KGM", hs: "39011000" }, { code: "N-2", name: "Hàng mới hai", unit: "PCE" }])));
    const [a, b] = h.uow.data.queue;
    ok(await decideQueue(h.deps, admin, a!.id, { action: "CREATE", kind: "MATERIAL" }));
    ok(await decideQueue(h.deps, admin, b!.id, { action: "CONFIRM" }));
    expect(h.uow.data.items.map((i) => [i.itemNo, i.name, i.baseUnit, i.hsCode, i.kind])).toEqual([
      ["MH-000001", "Hàng mới một", "KGM", "39011000", "MATERIAL"],
      ["MH-000002", "Hàng mới hai", "PCE", null, "GOODS"],
    ]);
    expect(h.uow.data.aliases.map((x) => [x.codeKey, x.status])).toEqual([["N1", "ACTIVE"], ["N2", "ACTIVE"]]);
  });

  it("quyền duyệt: người phụ trách bộ của mục / ADMIN; người khác → CATALOG_NOT_CODE_SET_OWNER", async () => {
    const h = setup();
    const q = await maybeRow(h);
    const r = await decideQueue(h.deps, declarant, q.id, { action: "SKIP" });
    expect(r.ok ? null : r.error.reason).toBe("CATALOG_NOT_CODE_SET_OWNER");
    seedOwner(h, "acc", declarant.userId);
    expect((await decideQueue(h.deps, declarant, q.id, { action: "SKIP" })).ok).toBe(true);
  });

  it("xác nhận hàng loạt: mục đủ điều kiện xong, mục thiếu hệ số báo lỗi riêng", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Vải cotton trắng khổ 1m6", nameKey: "vai cotton trang kho 1m6", hsCode: "52081100", baseUnit: "MTR" });
    ok(await importRows(h.deps, admin, input("acc", [
      { code: "X1", name: "Vải cotton trắng khổ 1m6 loại tốt", unit: "MTR" },
      { code: "X2", name: "Vải cotton trắng khổ 1m6 loại hai", unit: "ROL" },
      { code: "X3", name: "Hàng chưa có" },
    ])));
    const ids = h.uow.data.queue.map((q) => q.id);
    const r = ok(await decideQueueBulk(h.deps, admin, { ids, action: "CONFIRM" }));
    expect(r.decided).toEqual([ids[0], ids[2]]);
    expect(r.failed).toEqual([{ id: ids[1], code: "VALIDATION", reason: "CATALOG_UNIT_FACTOR_REQUIRED" }]);
    expect(h.uow.data.items).toHaveLength(2);
  });

  it("listQueue: lọc 'của tôi' theo bộ mình phụ trách, theo mức, phân trang", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Vải cotton trắng khổ 1m6", nameKey: "vai cotton trang kho 1m6", hsCode: "52081100", baseUnit: "MTR" });
    ok(await importRows(h.deps, admin, input("acc", [{ code: "X1", name: "Vải cotton trắng khổ 1m6 loại tốt", unit: "MTR" }, { code: "X3", name: "Hàng chưa có" }])));
    ok(await importRows(h.deps, admin, input("wh", [{ code: "W1", name: "Hàng kho" }])));
    seedOwner(h, "wh", declarant.userId);
    const mine = ok(await listQueue(h.deps, declarant, { mine: true, status: "PENDING", page: 1, pageSize: 50 }));
    expect(mine.rows.map((r) => r.code)).toEqual(["W1"]);
    expect(ok(await listQueue(h.deps, viewer, { level: "MAYBE", status: "PENDING", page: 1, pageSize: 50 })).rows.map((r) => r.code)).toEqual(["X1"]);
    const p2 = ok(await listQueue(h.deps, admin, { status: "PENDING", page: 2, pageSize: 2 }));
    expect([p2.total, p2.rows.length]).toEqual([3, 1]);
  });

  it("listQueue: kèm tóm tắt mặt hàng gợi ý (needsFactor theo quy đổi) + ứng viên; gợi ý đã gộp → mặt hàng cuối chuỗi; org khác không thấy", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Bulong M8", nameKey: "bulong m8", hsCode: "73181510", baseUnit: "PCE" });
    ok(await importRows(h.deps, admin, input("wh", [{ code: "B2", name: "Bulong M8", unit: "KGM", hs: "73181510" }])));
    ok(await importRows(h.deps, admin, input("acc", [{ code: "Z9", name: "Chưa có hàng nào giống" }])));
    let rows = ok(await listQueue(h.deps, admin, { status: "PENDING", page: 1, pageSize: 50 })).rows;
    const b2 = rows.find((r) => r.code === "B2")!;
    expect(b2.suggested).toEqual({ id: "i1", itemNo: "MH-i1", name: "Bulong M8", hsCode: "73181510", baseUnit: "PCE", needsFactor: true });
    expect(b2.candidateItems[0]).toMatchObject({ id: "i1", itemNo: "MH-i1", score: expect.any(Number), reason: expect.any(String) });
    expect(rows.find((r) => r.code === "Z9")).toMatchObject({ suggested: null, candidateItems: [] });

    // Có quy đổi KGM → không cần hệ số; i1 gộp vào i2 → gợi ý trỏ i2.
    h.uow.data.conversions.push({ id: "ucv1", orgId: ORG, itemId: "i1", unit: "KGM", factor: "50", createdAt: NOW, updatedAt: NOW });
    rows = ok(await listQueue(h.deps, admin, { status: "PENDING", page: 1, pageSize: 50 })).rows;
    expect(rows.find((r) => r.code === "B2")!.suggested?.needsFactor).toBe(false);
    seedItem(h, { id: "i2", name: "Bulong M8 mạ kẽm", nameKey: "bulong m8 ma kem", baseUnit: "PCE" });
    Object.assign(h.uow.data.items.find((i) => i.id === "i1")!, { status: "MERGED", mergedIntoId: "i2" });
    rows = ok(await listQueue(h.deps, admin, { status: "PENDING", page: 1, pageSize: 50 })).rows;
    expect(rows.find((r) => r.code === "B2")!.suggested).toMatchObject({ id: "i2", itemNo: "MH-i2", needsFactor: true });
    expect(ok(await listQueue(h.deps, otherAdmin, { status: "PENDING", page: 1, pageSize: 50 })).rows).toEqual([]);
  });
});

describe("importFromDocuments", () => {
  it("INVOICES: Part No của 2 nhà cung cấp → 2 bộ nhà cung cấp (tạo nếu chưa có), dòng đi qua ghép", async () => {
    const h = setup();
    seedSet(h, { id: "sup_a", kind: "SUPPLIER", name: "ACME", partnerName: "ACME Co., Ltd", partnerKey: "acme co., ltd" });
    h.docs.invoices = [
      { code: "P-100", name: "Bearing 6201", unit: "PCE", hsCode: "84821000", partnerName: "ACME Co., Ltd", sourceRef: "dossier:d1:1" },
      { code: "P-100", name: "Bearing 6201", unit: "PCE", hsCode: "84821000", partnerName: "ACME CO., LTD.", sourceRef: "dossier:d2:1" },
      { code: "Q-7", name: "Seal ring", unit: "XYZ", hsCode: "abc", partnerName: "Beta Industrial", sourceRef: "dossier:d3:2" },
      { code: "", name: "no code", partnerName: "Beta Industrial", sourceRef: "dossier:d3:3" },
      { code: "R-1", name: "no seller", partnerName: null, sourceRef: "dossier:d4:1" },
    ];
    const imps = ok(await importFromDocuments(h.deps, admin, { source: "INVOICES" }));
    expect(imps).toHaveLength(2);
    const sets = h.uow.data.codeSets.filter((s) => s.kind === "SUPPLIER");
    expect(sets.map((s) => s.partnerKey).sort()).toEqual(["acme co., ltd", "beta industrial"]);
    const beta = sets.find((s) => s.partnerKey === "beta industrial")!;
    expect(beta).toMatchObject({ name: "Beta Industrial", partnerName: "Beta Industrial" });
    expect(h.uow.data.queue.map((q) => [q.codeSetId, q.code, q.unit, q.hsCode, q.sourceRef]).sort((x, y) => String(x[1]).localeCompare(String(y[1])))).toEqual([
      ["sup_a", "P-100", "PCE", "84821000", "dossier:d1:1"],
      [beta.id, "Q-7", null, null, "dossier:d3:2"],
    ]);
    expect(imps.every((i) => i.status === "DONE")).toBe(true);
  });

  it("DECLARATIONS: dòng tờ khai đã duyệt (mã hàng + HS) → bộ XNK mặc định; quyền theo người phụ trách bộ XNK", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Bulong M8", nameKey: "bulong m8", hsCode: "73181510", baseUnit: "PCE" });
    h.docs.declarations = [{ code: "BL8", name: "Bulong M8", unit: "PCE", hsCode: "73181510", sourceRef: "declaration:dec1:1" }];
    const denied = await importFromDocuments(h.deps, declarant, { source: "DECLARATIONS" });
    expect(denied.ok ? null : denied.error.reason).toBe("CATALOG_NOT_CODE_SET_OWNER");
    const imps = ok(await importFromDocuments(h.deps, admin, { source: "DECLARATIONS" }));
    expect(imps).toHaveLength(1);
    expect(imps[0]).toMatchObject({ codeSetId: "xnk", counts: { matched: 1 } });
    expect(h.uow.data.aliases).toEqual([expect.objectContaining({ codeSetId: "xnk", codeKey: "BL8", itemId: "i1", status: "ACTIVE", source: "DOCUMENT" })]);
  });

  it("INVOICES tạo bộ mã → chỉ ADMIN/OWNER; không có dòng → danh sách rỗng", async () => {
    const h = setup();
    h.docs.invoices = [{ code: "P-1", name: "X", partnerName: "ACME", sourceRef: "dossier:d1:1" }];
    const r = await importFromDocuments(h.deps, declarant, { source: "INVOICES" });
    expect(r.ok ? null : r.error.code).toBe("FORBIDDEN");
    h.docs.invoices = [];
    expect(ok(await importFromDocuments(h.deps, admin, { source: "INVOICES" }))).toEqual([]);
  });
});

describe("review fix round 1", () => {
  it("INVOICES: dòng hồ sơ xuất (CUSTOMER) → bộ khách hàng theo người mua; cùng tên ở bộ nhà cung cấp không bị dùng nhầm", async () => {
    const h = setup();
    seedSet(h, { id: "sup_g", kind: "SUPPLIER", name: "Globex", partnerName: "Globex GmbH", partnerKey: "globex gmbh" });
    h.docs.invoices = [
      { code: "FG-1", name: "Finished good", unit: "PCE", partnerName: "Globex GmbH", partnerKind: "CUSTOMER", sourceRef: "dossier:xk1:1" },
      { code: "P-1", name: "Bearing", unit: "PCE", partnerName: "Globex GmbH", partnerKind: "SUPPLIER", sourceRef: "dossier:nk1:1" },
    ];
    const imps = ok(await importFromDocuments(h.deps, admin, { source: "INVOICES" }));
    expect(imps).toHaveLength(2);
    const customer = h.uow.data.codeSets.filter((x) => x.kind === "CUSTOMER");
    expect(customer).toEqual([expect.objectContaining({ partnerKey: "globex gmbh", partnerName: "Globex GmbH" })]);
    expect(h.uow.data.codeSets.filter((x) => x.kind === "SUPPLIER").map((x) => x.id)).toEqual(["sup_g"]);
    expect(h.uow.data.queue.map((q) => [q.code, q.codeSetId]).sort()).toEqual([["FG-1", customer[0]!.id], ["P-1", "sup_g"]]);
  });

  it("lấy lại từ chứng từ không ghi đè tên bí danh đã chỉnh bằng chữ OCR; chỉ điền ĐVT còn trống. Excel thì vẫn cập nhật", async () => {
    const h = setup();
    seedItem(h, { id: "i1", name: "Bulong M8", nameKey: "bulong m8", hsCode: "73181510", baseUnit: "PCE" });
    seedAlias(h, { id: "a1", codeSetId: "xnk", code: "BL8", codeKey: "BL8", itemId: "i1", name: "Bulong M8 (đã chỉnh)", unit: null });
    h.docs.declarations = [{ code: "BL8", name: "BULONG M8 X 30 OCR", unit: "PCE", hsCode: "73181510", sourceRef: "declaration:dec1:1" }];
    ok(await importFromDocuments(h.deps, admin, { source: "DECLARATIONS" }));
    expect(h.uow.data.aliases.find((a) => a.id === "a1")).toMatchObject({ name: "Bulong M8 (đã chỉnh)", unit: "PCE" });
    ok(await importRows(h.deps, admin, input("xnk", [{ code: "BL8", name: "Bulong M8 mới", unit: "PCE" }])));
    expect(h.uow.data.aliases.find((a) => a.id === "a1")!.name).toBe("Bulong M8 mới");
  });

  it("xếp job lỗi sau commit → lần nhập FAILED kèm lý do + trả lỗi (không kẹt PARSING)", async () => {
    const h = setup();
    h.deps.jobs = { enqueue: async () => { throw new Error("redis down"); } };
    const rows = Array.from({ length: 501 }, (_, i) => ({ code: `E${i}`, name: `Hàng ${i}` }));
    const r = await importRows(h.deps, admin, input("acc", rows));
    expect(r.ok ? null : r.error.code).toBe("NOT_READY");
    expect(h.uow.data.imports[0]).toMatchObject({ status: "FAILED" });
    expect(h.uow.data.imports[0]!.errors.at(-1)).toMatchObject({ field: "job", code: "ENQUEUE_FAILED" });
  });

  it("ghép đồng bộ lỗi giữa chừng → xếp job catalog-import làm tiếp; job chạy xong đủ counts", async () => {
    const h = setup();
    const inner = h.uow;
    let fail = true;
    h.deps.uow = {
      asOrg: (c, fn) =>
        inner.asOrg(c, (r) =>
          fn({
            ...r,
            queue: {
              ...r.queue,
              insert: async (row) => {
                if (fail && row.importRow === 3) {
                  fail = false;
                  throw new Error("connection reset");
                }
                return r.queue.insert(row);
              },
            },
          }),
        ),
    };
    const imp = ok(await importRows(h.deps, admin, input("acc", [{ code: "A1", name: "Một" }, { code: "A2", name: "Hai" }, { code: "A3", name: "Ba" }])));
    expect(imp.status).toBe("MATCHING");
    expect(h.jobs.jobs.map((j) => j.name)).toEqual(["catalog-import"]);
    // In-memory không rollback: dòng 1–2 đã ghi trước khi lỗi; DB thật rollback cả lô – job làm lại lô đó.
    h.uow.data.queue = [];
    const done = ok(await runMatch(h.deps, { orgId: ORG, userId: admin.userId }, imp.id));
    expect(done).toMatchObject({ status: "DONE", counts: { queued: 3, skipped: 0 } });
    expect(h.uow.data.queue).toHaveLength(3);
  });

  it("INVOICES nhiều bộ: xếp job lỗi ở bộ thứ 2 → bộ 1 và 3 vẫn ghép, bộ 2 FAILED, không lần nhập nào kẹt PARSING", async () => {
    const h = setup();
    h.deps.jobs = { enqueue: async () => { throw new Error("redis down"); } };
    const line = (partner: string, code: string) => ({ code, name: `Hàng ${code}`, partnerName: partner, partnerKind: "SUPPLIER" as const, sourceRef: `dossier:${partner}:${code}` });
    h.docs.invoices = [
      line("Alpha", "A-1"),
      ...Array.from({ length: 501 }, (_, i) => line("Beta", `B-${i}`)),
      line("Gamma", "G-1"),
    ];
    const imps = ok(await importFromDocuments(h.deps, admin, { source: "INVOICES" }));
    expect(imps.map((x) => x.status)).toEqual(["DONE", "FAILED", "DONE"]);
    expect(h.uow.data.imports.map((x) => x.status).sort()).toEqual(["DONE", "DONE", "FAILED"]);
    expect(h.uow.data.queue.map((q) => q.code).sort()).toEqual(["A-1", "G-1"]);
  });
});
