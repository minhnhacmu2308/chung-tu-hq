// Mock danh mục – bộ nguồn gốc, đổi ĐVT gốc, cột Mã nối, hàng chờ giữ hệ số (spec 2026-11-14): cùng quy tắc với backend
// (packages/core/src/modules/catalog/{domain/rebase.ts, application/source*.ts, match-run.ts, queue.ts, code-sets.ts}).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { divDecimal, plainDecimal } from "@/lib/decimal";
import { emptyCatalog, planRebase } from "@/mocks/catalog-engine";
import { getDb, resetDb } from "@/mocks/db";
import { SEED_SETS } from "@/mocks/seed/catalog";
import {
  changeCatalogMode, changeSourceSet, decideQueueItem, importCatalogRows, listCatalogItems, listCodeSets, listMatchQueue, previewSourceChange, saveCodeSet, setupCatalog,
} from "./catalog";

const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string; reason?: string }) => e.reason ?? e.code);
const actAs = (id: string) => {
  getDb().currentUserId = id;
};
const item = (id: string) => getDb().catalog.items.find((i) => i.id === id)!;
const convsOf = (id: string) => Object.fromEntries(getDb().catalog.conversions.filter((c) => c.itemId === id).map((c) => [c.unit, c.factor]));
const sourceKinds = async () => (await listCodeSets()).filter((s) => s.isSource).map((s) => s.kind);
const COLS = { code: 0, name: 1, unit: 2, factor: 3, linkCode: 4, kind: 5, origin: 6, importDutyRate: 7 };
const importInto = (codeSetId: string, rows: Record<string, string>[]) =>
  importCatalogRows({ codeSetId, fileName: "f.xlsx", columnMap: COLS, rows: rows.map((r) => ({ code: r.code ?? "", name: r.name ?? "", ...r })) });

vi.setConfig({ testTimeout: 40_000 });

beforeEach(() => {
  resetDb();
  actAs("usr_chau"); // ADMIN
});
afterEach(() => vi.useRealTimers());

describe("đổi ĐVT gốc – hàm thuần (như domain/rebase.ts)", () => {
  it("chia hệ số theo f, thêm quy đổi của gốc cũ, bỏ dòng của gốc mới, chia hệ số theo lô; 9 số lẻ ROUND_HALF_UP", () => {
    const p = planRebase({ baseUnit: "KGM", newBase: "TNE", conversions: [{ unit: "TNE", factor: "1000" }, { unit: "PCE", factor: "471" }], lineFactors: [{ id: "l1", factor: "500" }] });
    expect(p).toMatchObject({ kind: "REBASE", factor: "1000", conversions: [{ unit: "KGM", factor: "0.001" }, { unit: "PCE", factor: "0.471" }], lineFactors: [{ id: "l1", oldValue: "500", newValue: "0.5" }] });
    expect(planRebase({ baseUnit: "PCE", newBase: "CT", conversions: [{ unit: "CT", factor: "3" }, { unit: "SET", factor: "2" }] })).toMatchObject({
      conversions: [{ unit: "PCE", factor: "0.333333333" }, { unit: "SET", factor: "0.666666667" }],
    });
    // Hệ số truyền vào khi chưa có quy đổi của gốc mới.
    expect(planRebase({ baseUnit: "PCE", newBase: "DZN", conversions: [], factor: "12" })).toMatchObject({ kind: "REBASE", conversions: [{ unit: "PCE", factor: "0.083333333" }] });
  });

  it("SAME / SET_BASE / NO_FACTOR (thiếu hệ số, hoặc kết quả tròn về 0)", () => {
    expect(planRebase({ baseUnit: "pce", newBase: "PCE", conversions: [] }).kind).toBe("SAME");
    expect(planRebase({ baseUnit: null, newBase: "PCE", conversions: [] }).kind).toBe("SET_BASE");
    expect(planRebase({ baseUnit: "PCE", newBase: "CT", conversions: [] }).kind).toBe("NO_FACTOR");
    expect(planRebase({ baseUnit: "PCE", newBase: "CT", conversions: [{ unit: "CT", factor: "1000" }, { unit: "MG", factor: "0.000000001" }] }).kind).toBe("NO_FACTOR");
  });

  it("chia Decimal không qua số thực", () => {
    expect(divDecimal("1", "3")).toBe("0.333333333");
    expect(divDecimal("2", "3")).toBe("0.666666667");
    expect(divDecimal("235.5", "0.5")).toBe("471");
    expect(divDecimal("0.000000001", "1000")).toBe("0");
    expect(plainDecimal("012.500")).toBe("12.5");
  });
});

describe("bộ nguồn gốc – thiết lập, thêm bộ, đổi chế độ", () => {
  it("dữ liệu mẫu: đúng một bộ nguồn gốc là XNK", async () => {
    expect(await sourceKinds()).toEqual(["CUSTOMS"]);
  });

  it("thiết lập mỗi bộ phận theo sourceKind; chạy lại không kèm → giữ; bộ chọn đã có mã khi có nguồn gốc khác → CATALOG_MODE_CONFLICT", async () => {
    getDb().catalog = emptyCatalog();
    await setupCatalog({ mode: "PER_DEPARTMENT", sets: [], sourceKind: "ACCOUNTING" });
    expect(await sourceKinds()).toEqual(["ACCOUNTING"]);
    await setupCatalog({ mode: "PER_DEPARTMENT", sets: [] });
    expect(await sourceKinds()).toEqual(["ACCOUNTING"]);
    // Bộ Kho chưa có mã → chuyển cờ được ngay.
    await setupCatalog({ mode: "PER_DEPARTMENT", sets: [], sourceKind: "WAREHOUSE" });
    expect(await sourceKinds()).toEqual(["WAREHOUSE"]);
    // Bộ XNK đã có mã → phải dùng "Đổi bộ nguồn gốc".
    const cat = getDb().catalog;
    const xnk = cat.codeSets.find((s) => s.kind === "CUSTOMS")!;
    cat.aliases.push({ id: "ali_x", codeSetId: xnk.id, code: "A1", codeKey: "A1", name: null, unit: null, itemId: "x", status: "ACTIVE", proposedBy: "u", decidedBy: "u", decidedAt: null, source: "MANUAL", createdAt: "2026-01-01" });
    expect(await code(setupCatalog({ mode: "PER_DEPARTMENT", sets: [], sourceKind: "CUSTOMS" }))).toBe("CATALOG_MODE_CONFLICT");
    expect(await sourceKinds()).toEqual(["WAREHOUSE"]);
  });

  it("dùng chung → bộ Mã chung là nguồn gốc; sang mỗi bộ phận giữ nguyên bộ nguồn gốc (Mã chung thành Kế toán)", async () => {
    getDb().catalog = emptyCatalog();
    await setupCatalog({ mode: "SHARED", sets: [] });
    expect(await sourceKinds()).toEqual(["SHARED"]);
    const after = await changeCatalogMode({ to: "PER_DEPARTMENT", sharedBecomes: "ACCOUNTING" });
    expect(after.filter((s) => s.isSource).map((s) => s.kind)).toEqual(["ACCOUNTING"]);
    expect(after.find((s) => s.kind === "CUSTOMS")?.isSource).toBe(false);
  });

  it("thêm bộ: bộ nội bộ đầu tiên thành nguồn gốc; bộ sau / bộ đối tác thì không", async () => {
    getDb().catalog = emptyCatalog();
    expect((await saveCodeSet(null, { kind: "SUPPLIER", name: "SKF", partnerName: "SKF" })).isSource).toBe(false);
    expect((await saveCodeSet(null, { kind: "WAREHOUSE", name: "Kho" })).isSource).toBe(true);
    expect((await saveCodeSet(null, { kind: "CUSTOMS", name: "XNK" })).isSource).toBe(false);
  });
});

describe("đổi bộ nguồn gốc – xem trước + thực hiện + áp dụng lại", () => {
  it("Kho: số liệu xem trước, mặt hàng thiếu hệ số; thực hiện đổi gốc (quy đổi + hệ số theo lô chia lại, lịch sử), áp dụng lại sau khi bổ sung", async () => {
    // Dòng tờ khai gắn Vòng bi 6308ZZ (gốc PCE) có hệ số theo lô 24 PCE / đơn vị dòng.
    const line = getDb().lineItems.find((l) => l.catalogItem?.id === "prd_seed_2")!;
    line.unitFactor = "24";
    const p = await previewSourceChange(SEED_SETS.WH);
    expect(p).toMatchObject({ codeSetId: SEED_SETS.WH, currentSourceId: SEED_SETS.XNK });
    const canvas = getDb().catalog.items.find((i) => i.name.startsWith("Vải canvas cotton"))!;
    expect(p.blocked).toEqual([{ itemId: canvas.id, itemNo: canvas.itemNo, name: canvas.name, code: "VAI-C15", baseUnit: "MTR", newUnit: "KGM" }]);
    expect(p.rebaseCount).toBeGreaterThan(5);
    expect(p.totalItems).toBe(p.rebaseCount + p.unchangedCount + p.blocked.length + p.missingCount);
    // Xem trước không ghi gì.
    expect(item("prd_seed_2").baseUnit).toBe("PCE");

    const r = await changeSourceSet(SEED_SETS.WH);
    expect(r).toMatchObject({ changed: true, rebased: p.rebaseCount, missingCount: p.missingCount });
    expect(r.blocked.map((b) => b.code)).toEqual(["VAI-C15"]);
    expect(r.codeSets.filter((s) => s.isSource).map((s) => s.id)).toEqual([SEED_SETS.WH]);
    expect(item("prd_seed_2").baseUnit).toBe("DZN");
    expect(convsOf("prd_seed_2")).toEqual({ PCE: "0.083333333" });
    expect(line.unitFactor).toBe("2");
    // Thép tấm 10 mm: Kho tính theo tấm (1 PCE = 471 KGM) → gốc PCE, 1 KGM = 1/471 PCE.
    expect(convsOf("cat_seed_14")).toEqual({ KGM: "0.002123142" });
    const audit = getDb().catalog.audit;
    expect(audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: "prd_seed_2", key: "baseUnit", oldValue: "PCE", newValue: "DZN" }),
      expect.objectContaining({ itemId: "prd_seed_2", key: "conv:DZN", oldValue: "12", newValue: "" }),
      expect.objectContaining({ itemId: line.dossierId, key: `unitFactor:${line.lineNo}`, oldValue: "24", newValue: "2" }),
    ]));
    expect(item(canvas.id).baseUnit).toBe("MTR");

    // Bổ sung hệ số (1 KGM = 2 MTR) → áp dụng lại (idempotent: mặt hàng đã đổi gốc là SAME).
    getDb().catalog.conversions.push({ itemId: canvas.id, unit: "KGM", factor: "2" });
    const again = await changeSourceSet(SEED_SETS.WH);
    expect(again).toMatchObject({ changed: false, rebased: 1, blocked: [] });
    expect(item(canvas.id).baseUnit).toBe("KGM");
    expect(convsOf(canvas.id)).toEqual({ MTR: "0.5" });
    expect(item("prd_seed_2").baseUnit).toBe("DZN");
  });

  it("bộ đối tác → CATALOG_SOURCE_SET_INVALID; người phụ trách bộ khác → CATALOG_NOT_CODE_SET_OWNER; người phụ trách bộ đích được xem", async () => {
    expect(await code(changeSourceSet(SEED_SETS.SKF))).toBe("CATALOG_SOURCE_SET_INVALID");
    expect(await code(previewSourceChange("cst_khong_co"))).toBe("NOT_FOUND");
    actAs("usr_ha"); // DECLARANT, phụ trách bộ Kho
    expect(await code(previewSourceChange(SEED_SETS.WH))).toBe("OK");
    expect(await code(changeSourceSet(SEED_SETS.ACC))).toBe("CATALOG_NOT_CODE_SET_OWNER");
    expect(await sourceKinds()).toEqual(["CUSTOMS"]);
  });
});

describe("nhập file – luật bộ nguồn gốc", () => {
  it("bộ nguồn gốc (XNK): ĐVT của mã thành ĐVT gốc theo hệ số của dòng, thông tin mặt hàng của dòng áp vào; thiếu hệ số → giữ gốc, báo thiếu hệ số", async () => {
    await importInto(SEED_SETS.XNK, [
      { code: "30210", name: "Ổ bi đũa côn 30210 (hộp 10)", unit: "CT", factor: "10", kind: "Nguyên liệu", origin: "de", importDutyRate: "7,5" },
      { code: "UCP208", name: "Gối đỡ vòng bi UCP208 (có lắp ổ bi)", unit: "PCE" },
    ]);
    expect(item("prd_seed_3")).toMatchObject({ baseUnit: "CT", name: "Ổ bi đũa côn 30210 (hộp 10)", kind: "MATERIAL", origin: "DE", importDutyRate: "7.5" });
    expect(convsOf("prd_seed_3")).toEqual({ PCE: "0.1" });
    // UCP208: gốc SET, mã giờ là PCE mà chưa có hệ số → giữ gốc, danh sách báo thiếu hệ số.
    expect(item("prd_seed_4").baseUnit).toBe("SET");
    expect((await listCatalogItems({ missingFactor: true, pageSize: 200 })).rows.some((r) => r.id === "prd_seed_4")).toBe(true);
  });

  it("bộ không phải nguồn gốc (Kho): thông tin mặt hàng của dòng bỏ qua, ĐVT gốc không đổi", async () => {
    await importInto(SEED_SETS.WH, [{ code: "VT-0015", name: "Gối đỡ – tên kho", unit: "SET", origin: "DE", importDutyRate: "9" }]);
    expect(item("prd_seed_4")).toMatchObject({ baseUnit: "SET", origin: "CN", importDutyRate: "0", name: "Gối đỡ vòng bi UCP208 (có lắp ổ bi)" });
  });
});

describe("nhập file – cột Mã nối", () => {
  it("khớp mã nối (không phân biệt hoa thường) / mã bộ nguồn gốc → nối thẳng; không khớp → LINK_NOT_FOUND; mã đã thuộc mặt hàng khác → AMBIGUOUS; ĐVT thiếu hệ số → UNIT_NO_FACTOR", async () => {
    const imp = await importInto(SEED_SETS.ACC, [
      { code: "NEWACC-1", name: "Vít me", unit: "PCE", linkCode: "mh-000005" },
      { code: "NEWACC-2", name: "Động cơ", unit: "PCE", linkCode: "YS8024" },
      { code: "NEWACC-3", name: "Không rõ", linkCode: "NOPE-999" },
      { code: "VT-0014", name: "Ổ bi đũa côn 30210", linkCode: "MH-000001" },
      { code: "NEWACC-4", name: "Vòng bi hộp", unit: "CT", linkCode: "MH-000001" },
      { code: "NEWACC-5", name: "Vòng bi hộp 10", unit: "CT", factor: "10", linkCode: "MH-000001" },
    ]);
    expect(imp.counts).toMatchObject({ matched: 3, queued: 3, errors: 0 });
    const alias = (c: string) => getDb().catalog.aliases.find((a) => a.code === c && a.status === "ACTIVE");
    expect(alias("NEWACC-1")?.itemId).toBe("prd_seed_5");
    expect(alias("NEWACC-2")?.itemId).toBe("prd_seed_6");
    expect(alias("NEWACC-5")?.itemId).toBe("prd_seed_1");
    // Bộ Kế toán không phải nguồn gốc → chỉ lưu quy đổi, không đổi gốc.
    expect(item("prd_seed_1").baseUnit).toBe("PCE");
    expect(convsOf("prd_seed_1")).toEqual({ CT: "10" });
    const q = (c: string) => getDb().catalog.queue.find((x) => x.code === c)!;
    expect(q("NEWACC-3")).toMatchObject({ level: "NONE", reason: "LINK_NOT_FOUND", suggestedItemId: null });
    expect(q("VT-0014")).toMatchObject({ level: "MAYBE", reason: "AMBIGUOUS", suggestedItemId: "prd_seed_1" });
    expect(alias("VT-0014")?.itemId).toBe("prd_seed_3");
    // NEWACC-4 vào hàng chờ trước khi NEWACC-5 lưu quy đổi CT.
    expect(q("NEWACC-4")).toMatchObject({ level: "MAYBE", reason: "UNIT_NO_FACTOR", suggestedItemId: "prd_seed_1" });
    expect(q("NEWACC-4").candidates[0]).toMatchObject({ itemId: "prd_seed_1", reason: "LINKED_BY_CODE" });
  });
});

describe("hàng chờ giữ hệ số + thông tin mặt hàng", () => {
  it("bộ nguồn gốc: mục chờ giữ factor + itemFields; Tạo mới dùng itemFields; Chọn mặt hàng không gửi hệ số → dùng hệ số của dòng (và đổi gốc theo bộ nguồn gốc)", async () => {
    await importInto(SEED_SETS.XNK, [
      { code: "NEW-X1", name: "Lưỡi cưa gỗ hợp kim A1", unit: "PCE", factor: "5", kind: "SUPPLY", origin: "DE", importDutyRate: "7" },
      { code: "NEW-X2", name: "Lưỡi cưa gỗ hợp kim B2", unit: "ROL", factor: "50" },
    ]);
    const page = await listMatchQueue({ codeSetId: SEED_SETS.XNK, pageSize: 50 });
    const x1 = page.rows.find((r) => r.code === "NEW-X1")!;
    expect(x1).toMatchObject({ factor: "5", itemFields: { name: "Lưỡi cưa gỗ hợp kim A1", kind: "SUPPLY", origin: "DE", importDutyRate: "7" } });
    const created = await decideQueueItem(x1.id, { action: "CREATE" });
    expect(item(created.suggestedItemId!)).toMatchObject({ kind: "SUPPLY", origin: "DE", importDutyRate: "7", baseUnit: "PCE" });

    // Vải PP (gốc MTR, 1 ROL = 50 MTR có sẵn) ← chọn cho NEW-X2 (ROL): XNK là nguồn gốc → gốc thành ROL, 1 MTR = 0,02 ROL.
    const x2 = page.rows.find((r) => r.code === "NEW-X2")!;
    expect(x2.factor).toBe("50");
    await decideQueueItem(x2.id, { action: "CHOOSE", itemId: "cat_seed_16" });
    expect(item("cat_seed_16").baseUnit).toBe("ROL");
    expect(convsOf("cat_seed_16")).toEqual({ MTR: "0.02" });
  });

  it("Chọn mặt hàng chưa có quy đổi: không gửi hệ số → dùng factor của mục; bộ không phải nguồn gốc → itemFields null", async () => {
    await importInto(SEED_SETS.ACC, [{ code: "NEW-A1", name: "Lưỡi cưa gỗ hợp kim C3", unit: "CT", factor: "4", origin: "DE" }]);
    const q = getDb().catalog.queue.find((x) => x.code === "NEW-A1")!;
    expect(q).toMatchObject({ factor: "4", itemFields: null });
    await decideQueueItem(q.id, { action: "CHOOSE", itemId: "prd_seed_1" });
    expect(convsOf("prd_seed_1")).toEqual({ CT: "4" });
    expect(item("prd_seed_1").baseUnit).toBe("PCE");
  });
});
