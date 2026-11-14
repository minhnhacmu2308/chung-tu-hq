import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { emptyCatalog } from "@/mocks/catalog-engine";
import { SEED_SETS } from "@/mocks/seed/catalog";
import {
  aliasAction, archiveCatalogItem, changeCatalogMode, createCatalogItem, decideQueueBulk, decideQueueItem, exportCrossReference, getCatalogImport, getCatalogItem,
  getCatalogSettings, importCatalogRows, linkLineItem, recordCatalogDeclarationNo, resolveCatalogMany, listCatalogItems, listCodeSets, listMatchQueue, mergeCatalogItems, proposeAlias, resolveCatalogItem, saveCodeSet,
  setConversion, setLineUnitFactor, setupCatalog,
} from "./catalog";
import { getDeclarationView } from "./declaration";

/** Lỗi → mã lý do (nếu có) hoặc mã lỗi – cùng dạng ApiError client http trả. */
const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string; reason?: string }) => e.reason ?? e.code);
const actAs = (id: string) => {
  getDb().currentUserId = id;
};
const row = (code: string, name: string, unit?: string, hs?: string) => ({ code, name, ...(unit ? { unit } : {}), ...(hs ? { hs } : {}) });

// Mỗi lời gọi mock trễ 250–650 ms (mock-request) → luồng nhiều bước cần thời gian chờ dài hơn mặc định.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  resetDb();
  actAs("usr_chau"); // ADMIN
});
afterEach(() => vi.useRealTimers());

describe("danh mục hàng hóa dùng chung (mock) – dữ liệu mẫu", () => {
  it("3 bộ nội bộ (Kế toán MISA, Kho, XNK) + 2 bộ nhà cung cấp; ~40 mặt hàng; 8 mục chờ đủ 3 mức", async () => {
    const sets = await listCodeSets();
    expect(sets.filter((s) => ["ACCOUNTING", "WAREHOUSE", "CUSTOMS"].includes(s.kind))).toHaveLength(3);
    expect(sets.filter((s) => s.kind === "SUPPLIER")).toHaveLength(2);
    expect(sets.find((s) => s.kind === "CUSTOMS")).toMatchObject({ isDefault: true });
    expect((await getCatalogSettings()).mode).toBe("PER_DEPARTMENT");
    const page = await listCatalogItems({ pageSize: 200 });
    expect(page.total).toBeGreaterThanOrEqual(38);
    // Mặt hàng cũ giữ id; mã hiển thị chính = mã Kế toán.
    expect(page.rows.find((r) => r.id === "prd_seed_1")).toMatchObject({ displayCode: "vt-0012", codeSetCount: 4, missingCustoms: false });
    expect(page.rows.some((r) => r.missingFactor)).toBe(true);
    expect(page.rows.some((r) => r.missingCustoms)).toBe(true);
    const q = await listMatchQueue({ pageSize: 50 });
    expect(q.total).toBe(8);
    expect(new Set(q.rows.map((r) => r.level))).toEqual(new Set(["SURE", "MAYBE", "NONE"]));
  });

  it("tìm theo mọi mã (viết khác) / tên không dấu; xem theo bộ Kho trả mã + ĐVT kho", async () => {
    expect((await listCatalogItems({ q: "VT0012" })).rows.map((r) => r.id)).toEqual(["prd_seed_1"]);
    expect((await listCatalogItems({ q: "day cap dien" })).total).toBe(2);
    const wh = await listCatalogItems({ codeSetId: SEED_SETS.WH, q: "DC-0001" });
    expect(wh.rows[0]).toMatchObject({ setCode: "dc 0001", setUnit: "ROL", baseUnit: "MTR" });
    expect((await listCatalogItems({ missingCustoms: true })).rows.every((r) => r.missingCustoms)).toBe(true);
  });

  it("tra mã: mã viết khác trong bộ → SURE kèm hệ số; mã lạ → NONE", async () => {
    expect(await resolveCatalogItem({ codeSetId: SEED_SETS.WH, code: "DC 0001", unit: "ROL" })).toMatchObject({ level: "SURE", itemId: "cat_seed_8", factor: "100" });
    expect(await resolveCatalogItem({ codeSetId: SEED_SETS.WH, code: "ZZZ-1", name: "Hàng lạ hoàn toàn" })).toMatchObject({ level: "NONE", itemId: null });
  });

  it("tra nhiều dòng: đúng thứ tự, ứng viên kèm tóm tắt mặt hàng (HS, số lần khai) – cả danh mục, không giới hạn trang", async () => {
    const r = await resolveCatalogMany([{ name: "Lưỡi cưa gỗ" }, { name: "Quạt công nghiệp 750W" }, { name: "x", code: "DC 0001", hsCode: "8544" }]);
    expect(r.map((x) => x.level)).toEqual(["NONE", "MAYBE", "SURE"]);
    expect(r[1]!.candidates[0]).toMatchObject({ item: { name: "Quạt công nghiệp 750W", hsCode: "84145199", timesDeclared: 4 } });
    expect(r[2]!.itemId).toBe("cat_seed_8");
    await expect(resolveCatalogMany(Array.from({ length: 501 }, () => ({ name: "x" })))).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("thiết lập → nhập file → hàng chờ → xác nhận", () => {
  it("mặt hàng có mã ở 2 bộ; bộ Kho trả mã/ĐVT kho; thiếu hệ số → CATALOG_UNIT_FACTOR_REQUIRED; đã xử lý → CATALOG_QUEUE_ITEM_DONE; bảng đối chiếu", async () => {
    getDb().catalog = emptyCatalog();
    const sets = await setupCatalog({ mode: "PER_DEPARTMENT", prefix: "VT-", sets: [{ kind: "ACCOUNTING", name: "Kế toán (MISA)", ownerIds: ["usr_tuan"] }], primaryDisplayKind: "ACCOUNTING" });
    expect(sets.map((s) => s.kind).sort()).toEqual(["ACCOUNTING", "CUSTOMS", "WAREHOUSE"]);
    const acc = sets.find((s) => s.kind === "ACCOUNTING")!;
    const wh = sets.find((s) => s.kind === "WAREHOUSE")!;
    expect(acc).toMatchObject({ name: "Kế toán (MISA)", ownerIds: ["usr_tuan"], isPrimaryDisplay: true });

    // File kế toán: dòng lỗi bỏ qua, dòng khác vào hàng chờ (danh mục trống → NONE).
    const imp = await importCatalogRows({
      codeSetId: acc.id, fileName: "misa.xlsx", columnMap: { code: 0, name: 1, unit: 2, hs: 3 },
      rows: [row("vt-0012 ", "Dây cáp điện CVV 3x2.5", "MTR", "8544.49.49"), row("", "Thiếu mã"), row("VT 0012", "Trùng mã viết khác"), row("VT-0013", "Hạt nhựa PP", "XYZ")],
    });
    expect(imp).toMatchObject({ status: "DONE", counts: { queued: 1, errors: 3 }, progress: { done: 1, total: 1 } });
    expect(imp.errors.map((e) => e.code)).toEqual(["MISSING", "DUPLICATE_IN_FILE", "UNKNOWN_UNIT"]);
    const [q1] = (await listMatchQueue({ importId: imp.id })).rows;
    expect(q1).toMatchObject({ level: "NONE", code: "vt-0012" });
    const done = await decideQueueItem(q1!.id, { action: "CONFIRM" });
    expect(done.status).toBe("DONE");
    expect(await code(decideQueueItem(q1!.id, { action: "CONFIRM" }))).toBe("CATALOG_QUEUE_ITEM_DONE");
    const itemId = done.suggestedItemId!;
    expect((await getCatalogItem(itemId)).item).toMatchObject({ itemNo: "VT-000001", baseUnit: "MTR", hsCode: "85444949" });

    // File kho: cùng mã viết khác + cùng HS 4 số nhưng tính theo cuộn, chưa có quy đổi → nghi vấn, bắt nhập hệ số.
    const imp2 = await importCatalogRows({ codeSetId: wh.id, fileName: "kho.xlsx", columnMap: { code: 0, name: 1, unit: 2, hs: 3 }, rows: [row("VT0012", "Cáp CVV 3x2.5 (cuộn)", "ROL", "85444949")] });
    expect(imp2.counts).toMatchObject({ queued: 1, matched: 0 });
    const [q2] = (await listMatchQueue({ importId: imp2.id })).rows;
    expect(q2).toMatchObject({ level: "MAYBE", reason: "UNIT_NO_FACTOR", suggestedItemId: itemId });
    expect(await code(decideQueueItem(q2!.id, { action: "CONFIRM" }))).toBe("CATALOG_UNIT_FACTOR_REQUIRED");
    await decideQueueItem(q2!.id, { action: "CONFIRM", factor: "100" });
    expect((await getCatalogImport(imp2.id)).counts).toMatchObject({ queued: 0, matched: 1 });

    const detail = await getCatalogItem(itemId);
    expect(new Set(detail.aliases.filter((a) => a.status === "ACTIVE").map((a) => a.codeSetId))).toEqual(new Set([acc.id, wh.id]));
    expect(detail.conversions).toEqual([{ unit: "ROL", factor: "100" }]);
    const byWh = await listCatalogItems({ codeSetId: wh.id });
    expect(byWh.rows[0]).toMatchObject({ setCode: "VT0012", setUnit: "ROL", displayCode: "vt-0012", codeSetCount: 2 });

    // Nhập lại cùng file kho: mã đã có trong bộ → cập nhật, không sinh mặt hàng/hàng chờ mới.
    const again = await importCatalogRows({ codeSetId: wh.id, fileName: "kho.xlsx", columnMap: {}, rows: [row("VT 0012", "Cáp CVV 3x2.5 – cuộn 100 m", "ROL", "85444949")] });
    expect(again.counts).toMatchObject({ matched: 1, queued: 0 });
    expect((await listCatalogItems({})).total).toBe(1);

    const x = await exportCrossReference();
    expect(x.codeSets).toHaveLength(3);
    expect(x.rows).toEqual([{ itemNo: "VT-000001", name: "Dây cáp điện CVV 3x2.5", hs: "85444949", baseUnit: "MTR", codes: { [acc.id]: ["vt-0012"], [wh.id]: ["VT0012"] }, factors: { ROL: "100" } }]);
  });

  it("> 500 dòng chạy nền: trả MATCHING, tiến độ tăng dần theo thời gian rồi DONE", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const rows = Array.from({ length: 1200 }, (_, i) => row(`NEW-${i + 1}`, `Mặt hàng mới số ${i + 1}`, "PCE"));
    const imp = await importCatalogRows({ codeSetId: SEED_SETS.ACC, fileName: "lon.xlsx", columnMap: {}, rows });
    expect(imp.status).toBe("MATCHING");
    expect(imp.progress).toEqual({ done: 0, total: 1200 });
    vi.setSystemTime(Date.now() + 1500);
    const mid = await getCatalogImport(imp.id);
    expect(mid.progress.done).toBeGreaterThan(0);
    expect(mid.progress.done).toBeLessThan(1200);
    vi.setSystemTime(Date.now() + 60_000);
    const fin = await getCatalogImport(imp.id);
    expect(fin).toMatchObject({ status: "DONE", progress: { done: 1200, total: 1200 }, counts: { queued: 1200 } });
    // Xong → dòng tạm bỏ khỏi "DB" (localStorage).
    expect(getDb().catalog.imports.find((i) => i.id === imp.id)!.rows).toBeNull();
  });

  it("quá 5.000 dòng một lần gửi → CATALOG_IMPORT_TOO_LARGE {max}; lỗi theo dòng chỉ giữ 200 mục đầu (đếm đủ)", async () => {
    const big = Array.from({ length: 5_001 }, (_, i) => row(`B-${i}`, `Hàng ${i}`));
    const err = await importCatalogRows({ codeSetId: SEED_SETS.ACC, fileName: "to.xlsx", columnMap: {}, rows: big }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "VALIDATION", reason: "CATALOG_IMPORT_TOO_LARGE", params: { max: 5_000 } });
    const bad = Array.from({ length: 300 }, () => row("", "Thiếu mã"));
    const imp = await importCatalogRows({ codeSetId: SEED_SETS.ACC, fileName: "loi.xlsx", columnMap: {}, rows: bad });
    expect(imp.counts.errors).toBe(300);
    expect(imp.errors).toHaveLength(200);
  });

  it("xác nhận hàng loạt: mục thiếu hệ số báo riêng, mục khác vẫn xong", async () => {
    const { rows } = await listMatchQueue({ pageSize: 50 });
    const sure = rows.filter((r) => r.level === "SURE").map((r) => r.id);
    const unit = rows.find((r) => r.reason === "UNIT_NO_FACTOR")!;
    const res = await decideQueueBulk({ ids: [...sure, unit.id], action: "CONFIRM" });
    expect(res.decided).toEqual(sure);
    expect(res.failed).toEqual([{ id: unit.id, code: "VALIDATION", reason: "CATALOG_UNIT_FACTOR_REQUIRED" }]);
    expect((await listMatchQueue({})).total).toBe(8 - sure.length);
  });

  it("danh sách hàng chờ kèm tóm tắt mặt hàng gợi ý (needsFactor) + ứng viên – như listQueue backend", async () => {
    const { rows } = await listMatchQueue({ pageSize: 50 });
    const unit = rows.find((r) => r.code === "TH-0010")!;
    expect(unit.suggested).toMatchObject({ id: unit.suggestedItemId, itemNo: expect.stringMatching(/^MH-\d{6}$/), baseUnit: "KGM", needsFactor: true });
    expect(unit.candidateItems[0]).toMatchObject({ id: unit.suggestedItemId, reason: expect.any(String) });
    expect(rows.find((r) => r.code === "6205-2RSH/C3")!.suggested?.needsFactor).toBe(false);
    expect(rows.find((r) => r.code === "KT-3L-50")).toMatchObject({ suggested: null, candidateItems: [] });
  });
});

describe("quyền, bí danh, gộp, chế độ", () => {
  it("mã đã thuộc mặt hàng khác trong bộ → CATALOG_CODE_TAKEN; người không phụ trách → đề xuất PROPOSED", async () => {
    expect(await code(proposeAlias({ itemId: "prd_seed_2", codeSetId: SEED_SETS.ACC, code: "VT 0012" }))).toBe("CATALOG_CODE_TAKEN");
    actAs("usr_ha"); // DECLARANT, phụ trách Kho – không phụ trách Kế toán
    const proposed = await proposeAlias({ itemId: "prd_seed_3", codeSetId: SEED_SETS.ACC, code: "VT-0114" });
    expect(proposed.status).toBe("PROPOSED");
    expect(await code(aliasAction(proposed.id, { action: "APPROVE" }))).toBe("CATALOG_NOT_CODE_SET_OWNER");
    actAs("usr_tuan"); // phụ trách Kế toán
    expect((await aliasAction(proposed.id, { action: "APPROVE" })).status).toBe("ACTIVE");
    actAs("usr_quang"); // VIEWER
    expect(await code(createCatalogItem({ kind: "GOODS", name: "X" }))).toBe("FORBIDDEN");
  });

  it("DECLARANT tạo mặt hàng ở bộ không phụ trách → vào hàng chờ; quy đổi; ngưng dùng", async () => {
    actAs("usr_ha");
    const r = await createCatalogItem({ kind: "GOODS", name: "Kìm điện 8 inch", codeSetId: SEED_SETS.ACC, code: "DC-KIM8", baseUnit: "PCE" });
    expect(r.status).toBe("QUEUED");
    actAs("usr_chau");
    const c = await createCatalogItem({ kind: "GOODS", name: "Kìm cắt 6 inch", codeSetId: SEED_SETS.ACC, code: "DC-KIM6", baseUnit: "PCE" });
    expect(c.status).toBe("CREATED");
    const id = c.status === "CREATED" ? c.item.item.id : "";
    expect(await setConversion({ itemId: id, unit: "DZN", factor: "12" })).toEqual([{ unit: "DZN", factor: "12" }]);
    await archiveCatalogItem(id, true);
    expect((await listCatalogItems({ q: "DC-KIM6" })).total).toBe(0);
  });

  it("gộp A→B rồi B→C: tra mã cũ của A ra C, số lần khai cộng dồn; gộp vào chính nó → CATALOG_MERGE_INVALID", async () => {
    const t1 = (await getCatalogItem("prd_seed_1")).item.timesDeclared;
    const t2 = (await getCatalogItem("prd_seed_2")).item.timesDeclared;
    await mergeCatalogItems("prd_seed_1", "prd_seed_2");
    await mergeCatalogItems("prd_seed_2", "prd_seed_3");
    expect(await resolveCatalogItem({ codeSetId: SEED_SETS.WH, code: "VT 0012" })).toMatchObject({ level: "SURE", itemId: "prd_seed_3" });
    expect((await getCatalogItem("prd_seed_3")).item.timesDeclared).toBe(t1 + t2 + 3);
    expect(await code(mergeCatalogItems("prd_seed_3", "prd_seed_3"))).toBe("CATALOG_MERGE_INVALID");
    expect(await code(mergeCatalogItems("prd_seed_4", "prd_seed_1"))).toBe("CATALOG_MERGE_INVALID");
  });

  it("bộ đối tác trùng → CATALOG_PARTNER_SET_EXISTS; đang PER_DEPARTMENT mà về SHARED khi còn > 1 bộ nội bộ → CATALOG_MODE_CONFLICT", async () => {
    expect(await code(saveCodeSet(null, { kind: "SUPPLIER", name: "SKF", partnerName: "skf korea ltd" }))).toBe("CATALOG_PARTNER_SET_EXISTS");
    expect(await code(changeCatalogMode({ to: "SHARED" }))).toBe("CATALOG_MODE_CONFLICT");
  });

  it("chế độ SHARED: thiết lập nhanh một bộ 'Mã chung', cấm tạo bộ Kế toán; sang PER_DEPARTMENT giữ bí danh", async () => {
    getDb().catalog = emptyCatalog();
    const sets = await setupCatalog({ mode: "SHARED", sets: [] });
    expect(sets).toHaveLength(1);
    const shared = sets[0]!;
    expect(shared).toMatchObject({ kind: "SHARED", name: "Mã chung", isDefault: true, isPrimaryDisplay: true });
    expect(await code(saveCodeSet(null, { kind: "ACCOUNTING", name: "Kế toán" }))).toBe("CATALOG_MODE_CONFLICT");
    expect((await saveCodeSet(null, { kind: "CUSTOMER", name: "ACME", partnerName: "ACME AB" })).kind).toBe("CUSTOMER");
    expect(await code(setupCatalog({ mode: "PER_DEPARTMENT", sets: [] }))).toBe("CATALOG_MODE_CONFLICT");
    const c = await createCatalogItem({ kind: "GOODS", name: "Ốc vít", codeSetId: shared.id, code: "OV-01", baseUnit: "PCE" });
    expect(c.status).toBe("CREATED");
    const after = await changeCatalogMode({ to: "PER_DEPARTMENT", sharedBecomes: "ACCOUNTING" });
    expect(after.find((s) => s.id === shared.id)).toMatchObject({ kind: "ACCOUNTING", isDefault: false, codeCount: 1 });
    expect(after.find((s) => s.kind === "CUSTOMS")).toMatchObject({ isDefault: true });
    expect((await getCatalogSettings()).mode).toBe("PER_DEPARTMENT");
  });
});

describe("dòng hàng ↔ danh mục", () => {
  it("C6: Hải quan cấp số tờ khai nhánh → số tờ khai cuối của mặt hàng trên dòng thuộc tờ đó (không đè tờ mới hơn, không cộng lần khai)", () => {
    const db = getDb();
    const base = db.lineItems[0]!;
    const [a, b] = db.catalog.items.filter((i) => i.status === "ACTIVE");
    const ref = (i: typeof a) => ({ id: i!.id, itemNo: i!.itemNo, name: i!.name });
    // Lô 2 tờ: dòng 1..50 tờ 1, dòng 51..60 tờ 2. Mặt hàng a ở dòng 1, b ở dòng 55.
    const { catalogItem: _none, ...plain } = structuredClone(base);
    db.lineItems.push(...Array.from({ length: 60 }, (_, k) => ({ ...plain, id: `itm_c6_${k + 1}`, dossierId: "dos_c6", lineNo: k + 1, ...(k === 0 ? { catalogItem: ref(a) } : k === 54 ? { catalogItem: ref(b) } : {}) })));
    Object.assign(a!, { lastDeclarationNo: null, lastDeclarationDate: "2026-11-13" });
    Object.assign(b!, { lastDeclarationNo: "107000000777", lastDeclarationDate: "2026-12-01" });
    const timesA = a!.timesDeclared;
    recordCatalogDeclarationNo(db, "dos_c6", 1, "107000000001", "2026-11-14");
    expect(a).toMatchObject({ lastDeclarationNo: "107000000001", lastDeclarationDate: "2026-11-14", timesDeclared: timesA });
    expect(b!.lastDeclarationNo).toBe("107000000777");
    // Tờ 2: mặt hàng b đang giữ tờ khai mới hơn → không đè.
    recordCatalogDeclarationNo(db, "dos_c6", 2, "107000000002", "2026-11-14");
    expect(b).toMatchObject({ lastDeclarationNo: "107000000777", lastDeclarationDate: "2026-12-01" });
    expect(a!.lastDeclarationNo).toBe("107000000001");
    // Có id dòng đã gửi (như raw.sentLineIds): theo đúng các dòng đó, không theo vị trí (dòng 1 thuộc tờ 1 theo vị trí nhưng được gửi trong tờ 2).
    recordCatalogDeclarationNo(db, "dos_c6", 2, "107000000003", "2026-12-05", ["itm_c6_1"]);
    expect(a).toMatchObject({ lastDeclarationNo: "107000000003", lastDeclarationDate: "2026-12-05" });
    expect(b!.lastDeclarationNo).toBe("107000000777");
  });

  it("gắn mặt hàng cho dòng → mã HAG_MAHANG từ bộ XNK; hệ số theo lô", async () => {
    const line = getDb().lineItems[0]!;
    const linked = await linkLineItem(line.id, { itemId: "prd_seed_1" });
    expect(linked).toMatchObject({ catalogItem: { id: "prd_seed_1", itemNo: "MH-000001" }, itemCode: "6205-2RS" });
    expect(linked.unknownCode).toBeFalsy();
    expect((await setLineUnitFactor(line.id, "12")).unitFactor).toBe("12");
    expect((await setLineUnitFactor(line.id, null)).unitFactor).toBeUndefined();
  });

  it("getDeclarationView (màn Review) mang gợi ý lượng theo ĐVT khai như listLineItems – dòng đã gắn, ĐVT invoice khác ĐVT mã XNK", async () => {
    const db = getDb();
    const line = db.lineItems.find((i) => i.dossierId === db.agentRuns[0]!.dossierId && i.lineNo === 1)!;
    // Dây cáp CVV 3x2.5: mã XNK theo MTR, 1 ROL = 100 MTR. Invoice ghi 2 cuộn.
    const item = db.catalog.items.find((i) => i.name === "Dây cáp điện CVV 3x2.5mm2")!;
    Object.assign(line, { quantity: "2", unit: "ROL", catalogItem: { id: item.id, itemNo: item.itemNo, name: item.name } });
    delete line.unitFactor;
    const view = await getDeclarationView(line.dossierId);
    expect(view.items.find((i) => i.id === line.id)!.qtySuggestion).toEqual({ qty: "200", unit: "MTR", factor: "100", lotFactor: false, deviates: false });
    line.unit = "MTR";
    expect((await getDeclarationView(line.dossierId)).items.find((i) => i.id === line.id)!.qtySuggestion).toBeUndefined();
  });
});
