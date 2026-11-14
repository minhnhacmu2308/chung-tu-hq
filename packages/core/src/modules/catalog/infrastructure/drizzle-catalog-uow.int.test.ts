import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId, ulidIdGen } from "../../../shared/ids.js";
import { createCatalogPort } from "../application/catalog-port.js";
import { upsertCodeSet } from "../application/code-sets.js";
import { importRows } from "../application/import.js";
import { mergeItems } from "../application/merge.js";
import { decideQueue } from "../application/queue.js";
import { runMatch } from "../application/match-run.js";
import { changeSourceSet } from "../application/source.js";
import { isDuplicate } from "../application/common.js";
import { rebaseItemTo } from "../application/source-rules.js";
import type { CatalogItemRow, ItemAliasRow } from "../application/ports.js";
import { DrizzleCatalogUow } from "./drizzle-catalog-uow.js";

let t: TestDb;
let db: Db;
let admin: Db;
let uow: DrizzleCatalogUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const now = new Date("2026-11-13T00:00:00Z");
const noJobs = { enqueue: async () => {} };
const noDocs = { approvedDeclarationLines: async () => [], invoiceLines: async () => [] };

/** Phần SQL chuyển dữ liệu nằm cuối migration (sau dòng `-- data-migration`). */
const migrationSql = (file = "0037_catalog.sql") => {
  const text = readFileSync(new URL(`../../../../drizzle/${file}`, import.meta.url), "utf8");
  return text
    .slice(text.indexOf("-- data-migration"))
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
};
const runDataMigration = async () => {
  for (const stmt of migrationSql()) await admin.execute(sql.raw(stmt));
};
const item = (id: string, orgId: string, itemNo: string, extra: Partial<CatalogItemRow> = {}): CatalogItemRow => ({
  id, orgId, itemNo, kind: "GOODS", name: id, nameKey: id, hsCode: null, baseUnit: "PCE", origin: null, tariffSchedule: null, importDutyRate: null, vatRate: null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null,
  description: null, note: null, timesDeclared: 0, lastDeclarationNo: null, lastDeclarationDate: null, lastTypeCode: null, status: "ACTIVE", mergedIntoId: null, source: "MANUAL", updatedBy: null, createdAt: now, updatedAt: now, ...extra,
});
const alias = (id: string, orgId: string, codeSetId: string, itemId: string, code: string, status: ItemAliasRow["status"]): ItemAliasRow => ({
  id, orgId, codeSetId, code, codeKey: code.toUpperCase(), name: null, unit: null, itemId, status, proposedBy: null, decidedBy: null, decidedAt: null, source: "MANUAL", createdAt: now, updatedAt: now,
});

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  admin = createDb(t.adminUrl, { max: 2 });
  await admin.execute(sql`INSERT INTO organizations (id, tax_code, name, plan_code) VALUES ('org_khac', '0100000097', 'KHÁC', 'PAYG')`);
  await admin.execute(sql`INSERT INTO users (id, email, password_hash, name) VALUES ('usr_khac', 'khac3@x.vn', 'x', 'Khác')`);
  await admin.execute(sql`INSERT INTO memberships (id, org_id, user_id, role) VALUES ('mem_khac3', 'org_khac', 'usr_khac', 'OWNER')`);
  // Dữ liệu product_catalog mẫu (trước khi chuyển).
  await admin.execute(sql`INSERT INTO product_catalog (id, org_id, key, name_key, code, name, hs_code, unit, import_duty_rate, partner, note, source, times_declared, created_at) VALUES
    ('prd_1', 'org_anphat', 'k1', 'thep cuon', 'vt-0012 ', 'Thép cuộn', '72142000', 'KGM', '5.0000', 'Công ty X', 'ghi chú', 'IMPORT', 3, '2026-01-01T00:00:00Z'),
    ('prd_2', 'org_anphat', 'k2', 'oc vit', NULL, 'Ốc vít', '73181500', 'PCE', NULL, NULL, NULL, 'IMPORT', 0, '2026-01-02T00:00:00Z'),
    ('prd_3', 'org_anphat', 'k3', 'oc vit 2', 'VT 0012', 'Ốc vít 2', '73181500', 'PCE', NULL, NULL, NULL, 'IMPORT', 0, '2026-01-03T00:00:00Z'),
    ('prd_4', 'org_khac', 'k1', 'day dien', 'DD1', 'Dây điện', '85444920', 'MTR', NULL, NULL, NULL, 'IMPORT', 0, '2026-01-01T00:00:00Z')`);
  await runDataMigration();
  db = createDb(t.appUrl, { max: 25 });
  uow = new DrizzleCatalogUow(db);
}, 120_000);
afterAll(async () => {
  await db?.close();
  await admin?.close();
  await t?.stop();
});

describe("chuyển dữ liệu product_catalog", () => {
  it("số mặt hàng = số dòng, id giữ nguyên, mã nối tuần tự theo org, partner vào note", async () => {
    const items = await uow.asOrg(A, (r) => r.items.list(A.orgId));
    expect(items.map((i) => i.id).sort()).toEqual(["prd_1", "prd_2", "prd_3"]);
    expect(items.map((i) => i.itemNo)).toEqual(["MH-000001", "MH-000002", "MH-000003"]);
    const p1 = items.find((i) => i.id === "prd_1")!;
    expect(p1).toMatchObject({ baseUnit: "KGM", hsCode: "72142000", importDutyRate: "5.0000", timesDeclared: 3, source: "MIGRATION", status: "ACTIVE" });
    expect(p1.note).toBe("ghi chú\nĐối tác: Công ty X");
    const itemsB = await uow.asOrg(B, (r) => r.items.list(B.orgId));
    expect(itemsB.map((i) => i.itemNo)).toEqual(["MH-000001"]);
  });

  it("bộ XNK mặc định, cấu hình mode chưa chọn, mã cũ thành bí danh ACTIVE MIGRATION", async () => {
    const sets = await uow.asOrg(A, (r) => r.codeSets.list(A.orgId));
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ kind: "CUSTOMS", name: "XNK", isDefault: true });
    const s = await uow.asOrg(A, (r) => r.settings.get(A.orgId));
    expect(s).toMatchObject({ mode: null, itemNoPrefix: "MH-", itemNoSeq: 3 });
    const aliases = await uow.asOrg(A, (r) => r.aliases.listForCodeSet(A.orgId, sets[0]!.id));
    // prd_1 và prd_3 cùng code_key VT0012 → chỉ một bí danh ACTIVE (không vi phạm unique); prd_2 không có mã.
    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toMatchObject({ codeKey: "VT0012", status: "ACTIVE", source: "MIGRATION", itemId: "prd_1" });
    // Dòng thua (prd_3) không mất dấu: vào hàng chờ ghép, trỏ cả hai mặt hàng.
    const queue = await uow.asOrg(A, (r) => r.queue.list(A.orgId));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: "cmq_mig_prd_3", level: "MAYBE", reason: "MIGRATION_DUPLICATE_CODE", status: "PENDING", codeSetId: sets[0]!.id, suggestedItemId: "prd_1", sourceRef: "prd_3", code: "VT 0012" });
    expect(queue[0]!.candidates.map((c) => c.itemId)).toEqual(["prd_1", "prd_3"]);
  });

  it("chạy lại không tạo thêm (idempotent) và vẫn cấp mã nối tiếp theo cho dòng mới", async () => {
    await runDataMigration();
    expect(await uow.asOrg(A, (r) => r.items.list(A.orgId))).toHaveLength(3);
    expect(await uow.asOrg(A, (r) => r.queue.list(A.orgId))).toHaveLength(1);
    await admin.execute(sql`INSERT INTO product_catalog (id, org_id, key, name_key, name, hs_code, source) VALUES ('prd_5', 'org_anphat', 'k5', 'moi', 'Mới', '39269099', 'IMPORT')`);
    await runDataMigration();
    const items = await uow.asOrg(A, (r) => r.items.list(A.orgId));
    expect(items).toHaveLength(4);
    expect(items.find((i) => i.id === "prd_5")!.itemNo).toBe("MH-000004");
  });
});

describe("RLS và ràng buộc", () => {
  it("org khác không đọc được (kể cả theo id)", async () => {
    expect(await uow.asOrg(B, (r) => r.items.get(B.orgId, "prd_1"))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.items.getMany(B.orgId, ["prd_1", "prd_2"]))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.settings.get(A.orgId))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.items.insert(item("x", A.orgId, "MH-9")))).rejects.toThrow();
  });

  it("unique bí danh ACTIVE: ACTIVE thứ hai cùng mã lỗi, PROPOSED cùng mã được", async () => {
    const set = (await uow.asOrg(A, (r) => r.codeSets.list(A.orgId)))[0]!;
    await uow.asOrg(A, async (r) => {
      await r.aliases.insert(alias("ali_a", A.orgId, set.id, "prd_2", "ZZ1", "ACTIVE"));
      await r.aliases.insert(alias("ali_p", A.orgId, set.id, "prd_3", "ZZ1", "PROPOSED"));
    });
    await expect(uow.asOrg(A, (r) => r.aliases.insert(alias("ali_b", A.orgId, set.id, "prd_3", "ZZ1", "ACTIVE")))).rejects.toThrow();
    expect((await uow.asOrg(A, (r) => r.aliases.findActive(A.orgId, set.id, "ZZ1")))?.id).toBe("ali_a");
  });

  it("unique mã nối theo org và (item, unit)", async () => {
    await expect(uow.asOrg(A, (r) => r.items.insert(item("dup", A.orgId, "MH-000001")))).rejects.toThrow();
    await uow.asOrg(A, async (r) => {
      await r.conversions.upsert({ id: "ucv_1", orgId: A.orgId, itemId: "prd_1", unit: "TNE", factor: "1000", createdAt: now, updatedAt: now });
      await r.conversions.upsert({ id: "ucv_2", orgId: A.orgId, itemId: "prd_1", unit: "TNE", factor: "1000.5", createdAt: now, updatedAt: now });
    });
    const cs = await uow.asOrg(A, (r) => r.conversions.listForItem(A.orgId, "prd_1"));
    expect(cs).toHaveLength(1);
    expect(Number(cs[0]!.factor)).toBe(1000.5);
    expect((await uow.asOrg(A, (r) => r.conversions.listByOrg(A.orgId))).map((c) => c.id)).toEqual(["ucv_1"]);
    expect(await uow.asOrg(B, (r) => r.conversions.listByOrg(B.orgId))).toEqual([]);
  });

  it("listByOrg bí danh: lọc trạng thái, org khác không thấy", async () => {
    const active = await uow.asOrg(A, (r) => r.aliases.listByOrg(A.orgId, { status: "ACTIVE" }));
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((a) => a.status === "ACTIVE" && a.orgId === A.orgId)).toBe(true);
    expect((await uow.asOrg(A, (r) => r.aliases.listByOrg(A.orgId))).length).toBeGreaterThanOrEqual(active.length);
    const other = await uow.asOrg(B, (r) => r.aliases.listByOrg(B.orgId));
    expect(other.map((a) => a.id)).toEqual(["ali_mig_prd_4"]);
    expect(await uow.asOrg(B, (r) => r.aliases.listByOrg(A.orgId))).toEqual([]);
  });

  it("chỉ một bộ mặc định / hiển thị chính mỗi org", async () => {
    const base = { orgId: A.orgId, partnerName: null, partnerKey: null, isSource: false, createdAt: now, updatedAt: now };
    await expect(uow.asOrg(A, (r) => r.codeSets.insert({ ...base, id: "cst_x", kind: "CUSTOMS", name: "Hai", isPrimaryDisplay: false, isDefault: true }))).rejects.toThrow();
    await uow.asOrg(A, (r) => r.codeSets.insert({ ...base, id: "cst_y", kind: "ACCOUNTING", name: "KT", isPrimaryDisplay: true, isDefault: false }));
    await expect(uow.asOrg(A, (r) => r.codeSets.insert({ ...base, id: "cst_z", kind: "WAREHOUSE", name: "Kho", isPrimaryDisplay: true, isDefault: false }))).rejects.toThrow();
  });
});

describe("nextItemNo và resolveMerged", () => {
  it("20 lần song song → 20 số khác nhau", async () => {
    await uow.asOrg(B, (r) => r.settings.upsert(B.orgId, { itemNoPrefix: "HG-" }, now));
    const nos = await Promise.all(Array.from({ length: 20 }, () => uow.asOrg(B, (r) => r.settings.nextItemNo(B.orgId))));
    expect(new Set(nos).size).toBe(20);
    expect(nos.every((n) => /^HG-\d{6}$/.test(n))).toBe(true);
  });

  it("A→B→C ra C; mặt hàng thường ra chính nó; id lạ null; org khác null", async () => {
    await uow.asOrg(A, async (r) => {
      await r.items.insert(item("mC", A.orgId, "MH-100003"));
      await r.items.insert(item("mB", A.orgId, "MH-100002", { status: "MERGED", mergedIntoId: "mC" }));
      await r.items.insert(item("mA", A.orgId, "MH-100001", { status: "MERGED", mergedIntoId: "mB" }));
    });
    expect((await uow.asOrg(A, (r) => r.items.resolveMerged(A.orgId, "mA")))?.id).toBe("mC");
    expect((await uow.asOrg(A, (r) => r.items.resolveMerged(A.orgId, "mC")))?.id).toBe("mC");
    expect(await uow.asOrg(A, (r) => r.items.resolveMerged(A.orgId, "nope"))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.items.resolveMerged(B.orgId, "mA"))).toBeNull();
  });
});

describe("gộp đồng thời (lockForUpdate + markMerged)", () => {
  it("A→B và B→A song song: đúng một bên thành công, không có vòng gộp", async () => {
    await uow.asOrg(A, async (r) => {
      await r.items.insert(item("rX", A.orgId, "MH-200001"));
      await r.items.insert(item("rY", A.orgId, "MH-200002"));
    });
    const deps = { uow, members: { eligibleOwners: async () => new Set<string>() }, jobs: noJobs, documents: noDocs, clock: { now: () => now }, idGen: ulidIdGen };
    const ctx = { ...A, role: "ADMIN" as const };
    const [r1, r2] = await Promise.all([mergeItems(deps, ctx, { fromId: "rX", intoId: "rY" }), mergeItems(deps, ctx, { fromId: "rY", intoId: "rX" })]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    expect((r1.ok ? r2 : r1)).toMatchObject({ ok: false, error: { reason: "CATALOG_MERGE_INVALID" } });
    const rows = await uow.asOrg(A, (r) => r.items.getMany(A.orgId, ["rX", "rY"]));
    expect(rows.filter((x) => x.status === "MERGED")).toHaveLength(1);
  });

  it("markMerged chỉ đổi dòng chưa MERGED; org khác không đổi được", async () => {
    await uow.asOrg(A, (r) => r.items.insert(item("mm1", A.orgId, "MH-200011")));
    expect(await uow.asOrg(B, (r) => r.items.markMerged(B.orgId, "mm1", "mC", "u", now))).toBe(false);
    expect(await uow.asOrg(A, (r) => r.items.markMerged(A.orgId, "mm1", "mC", "u", now))).toBe(true);
    expect(await uow.asOrg(A, (r) => r.items.markMerged(A.orgId, "mm1", "mC", "u", now))).toBe(false);
  });
});

describe("incrementDeclared nguyên tử", () => {
  it("10 lần song song → +10; org khác không cộng được", async () => {
    await uow.asOrg(A, (r) => r.items.insert(item("inc1", A.orgId, "MH-300001")));
    await Promise.all(Array.from({ length: 10 }, () => uow.asOrg(A, (r) => r.items.incrementDeclared(A.orgId, "inc1", { updatedAt: now }))));
    await uow.asOrg(B, (r) => r.items.incrementDeclared(B.orgId, "inc1", { updatedAt: now }));
    expect((await uow.asOrg(A, (r) => r.items.get(A.orgId, "inc1")))?.timesDeclared).toBe(10);
  });
});

describe("recordDeclarationNo – số tờ khai cuối (C6)", () => {
  it("UPDATE có điều kiện: ngày trống / ≤ → ghi; ngày cũ hơn → không; times_declared giữ nguyên; org khác không ghi được; qua cổng theo chuỗi gộp", async () => {
    await uow.asOrg(A, (r) => r.items.insert(item("dno1", A.orgId, "MH-310001", { timesDeclared: 2 })));
    const at = new Date("2026-11-14T00:00:00Z");
    expect(await uow.asOrg(A, (r) => r.items.recordDeclarationNo(A.orgId, "dno1", "107000000001", "2026-11-14", at))).toBe(true);
    expect(await uow.asOrg(A, (r) => r.items.recordDeclarationNo(A.orgId, "dno1", "107000000000", "2026-11-10", at))).toBe(false);
    expect(await uow.asOrg(A, (r) => r.items.recordDeclarationNo(A.orgId, "dno1", "107000000001", "2026-11-14", at))).toBe(true);
    expect(await uow.asOrg(B, (r) => r.items.recordDeclarationNo(B.orgId, "dno1", "999", "2026-12-31", at))).toBe(false);
    expect(await uow.asOrg(A, (r) => r.items.get(A.orgId, "dno1"))).toMatchObject({ lastDeclarationNo: "107000000001", lastDeclarationDate: "2026-11-14", timesDeclared: 2 });
    // Mặt hàng đã gộp: cổng ghi vào mặt hàng cuối chuỗi.
    await uow.asOrg(A, (r) => r.items.insert(item("dno2", A.orgId, "MH-310002", { status: "MERGED", mergedIntoId: "dno1" })));
    const deps = { uow, members: { eligibleOwners: async () => new Set<string>() }, jobs: noJobs, documents: noDocs, clock: { now: () => at }, idGen: ulidIdGen };
    expect(await createCatalogPort(deps).recordDeclarationNo(A.orgId, [{ itemId: "dno2", declarationNo: "107000000002", date: "2026-11-15" }])).toEqual({ updated: 1 });
    expect(await uow.asOrg(A, (r) => r.items.get(A.orgId, "dno1"))).toMatchObject({ lastDeclarationNo: "107000000002", lastDeclarationDate: "2026-11-15", timesDeclared: 2 });
  });
});

describe("nhập Excel → ghép → hàng chờ (Postgres thật)", () => {
  it("lưu tạm dòng, ghép theo lô, cộng counts nguyên tử, xóa dòng tạm khi DONE; chạy lại không trùng; duyệt 2 lần → DONE; org khác không thấy", async () => {
    const jobs: { name: string; payload: unknown }[] = [];
    const deps = { uow, members: { eligibleOwners: async () => new Set<string>() }, jobs: { enqueue: async (name: string, payload: unknown) => void jobs.push({ name, payload }) }, documents: noDocs, clock: { now: () => now }, idGen: ulidIdGen };
    const ctx = { ...A, role: "ADMIN" as const };
    const setId = (await uow.asOrg(A, (r) => r.codeSets.list(A.orgId))).find((x) => x.isDefault)!.id;
    const rows = Array.from({ length: 520 }, (_, i) => ({ code: `IMP-${i}`, name: `Hàng nhập thử ${i} mẫu ${i * 3}`, unit: "PCE" }));
    const imp = await importRows(deps, ctx, { codeSetId: setId, fileName: "lon.xlsx", columnMap: { code: 0, name: 1 }, rows: [...rows, { code: "", name: "lỗi" }] });
    if (!imp.ok) throw new Error(JSON.stringify(imp.error));
    expect(imp.value).toMatchObject({ status: "PARSING", progress: { done: 0, total: 520 }, counts: { errors: 1 } });
    expect(jobs).toEqual([{ name: "catalog-import", payload: { orgId: A.orgId, userId: A.userId, importId: imp.value.id } }]);
    expect(await uow.asOrg(B, (r) => r.imports.get(B.orgId, imp.value.id))).toBeNull();

    // Hai lần chạy song song (job treo rồi chạy lại): khóa dòng lần nhập + kiểm rows_done → không ghép trùng lô.
    const [d1, d2] = await Promise.all([runMatch(deps, A, imp.value.id), runMatch(deps, A, imp.value.id)]);
    if (!d1.ok || !d2.ok) throw new Error("runMatch lỗi");
    const done = await runMatch(deps, A, imp.value.id);
    if (!done.ok) throw new Error(JSON.stringify(done.error));
    expect(done.value).toMatchObject({ status: "DONE", counts: { created: 0, matched: 0, queued: 520, skipped: 0, errors: 1 }, progress: { done: 520, total: 520 } });
    const stored = await uow.asOrg(A, (r) => r.imports.get(A.orgId, imp.value.id));
    expect(stored?.rows).toBeNull();
    const queue = await uow.asOrg(A, (r) => r.queue.list(A.orgId, { importId: imp.value.id }));
    expect(queue).toHaveLength(520);
    expect(await uow.asOrg(B, (r) => r.queue.list(B.orgId, { importId: imp.value.id }))).toHaveLength(0);

    // Unique (import_id, import_row): chèn trùng bị DB chặn.
    await expect(uow.asOrg(A, (r) => r.queue.insert({ ...queue[0]!, id: "cmq_dup" }))).rejects.toThrow();

    const first = await decideQueue(deps, ctx, queue[0]!.id, { action: "CREATE" });
    expect(first.ok).toBe(true);
    const again = await decideQueue(deps, ctx, queue[0]!.id, { action: "SKIP" });
    expect(again.ok ? null : again.error.reason).toBe("CATALOG_QUEUE_ITEM_DONE");
    expect((await uow.asOrg(A, (r) => r.imports.get(A.orgId, imp.value.id)))?.counts).toEqual({ created: 1, matched: 0, queued: 519, skipped: 0, errors: 1 });
    // claim chỉ thắng khi còn PENDING.
    expect(await uow.asOrg(A, (r) => r.queue.claim(A.orgId, queue[0]!.id, { status: "DONE", decidedBy: "x", decidedAt: now, updatedAt: now }))).toBe(false);
    expect(await uow.asOrg(B, (r) => r.queue.claim(B.orgId, queue[1]!.id, { status: "DONE", decidedBy: "x", decidedAt: now, updatedAt: now }))).toBe(false);
  }, 60_000);
});

describe("bộ mã đối tác: một bộ mỗi (org, loại, đối tác) – ensurePartnerSet song song (Task 5)", () => {
  it("10 lần ensurePartnerSet song song cùng tên → một bộ, cùng id; insert trùng trực tiếp lỗi unique; upsertCodeSet trùng → CATALOG_PARTNER_SET_EXISTS; org khác tách biệt", async () => {
    const deps = { uow, members: { eligibleOwners: async () => new Set<string>() }, jobs: noJobs, documents: noDocs, clock: { now: () => now }, idGen: ulidIdGen };
    const port = createCatalogPort(deps);
    const ids = await Promise.all(Array.from({ length: 10 }, () => port.ensurePartnerSet(A.orgId, "SUPPLIER", "Song Song Co., Ltd")));
    expect(new Set(ids).size).toBe(1);
    const sets = (await uow.asOrg(A, (r) => r.codeSets.list(A.orgId))).filter((s) => s.kind === "SUPPLIER" && s.partnerName === "Song Song Co., Ltd");
    expect(sets.map((s) => s.id)).toEqual([ids[0]]);
    const dup = { ...sets[0]!, id: "cst_dup" };
    await expect(uow.asOrg(A, (r) => r.codeSets.insert(dup))).rejects.toThrow();
    const res = await upsertCodeSet(deps, { ...A, role: "ADMIN" }, { kind: "SUPPLIER", name: "NCC trùng", partnerName: "song song co., ltd" });
    expect(res).toMatchObject({ ok: false, error: { reason: "CATALOG_PARTNER_SET_EXISTS" } });
    // Cùng tên nhưng loại khác (khách hàng) / org khác → được.
    expect(await port.ensurePartnerSet(A.orgId, "CUSTOMER", "Song Song Co., Ltd")).not.toBe(ids[0]);
    const other = await port.ensurePartnerSet(B.orgId, "SUPPLIER", "Song Song Co., Ltd");
    expect(other).not.toBe(ids[0]);
  });
});

describe("bộ nguồn gốc (migration 0040, spec 2026-11-14)", () => {
  const sourceOf = async (orgId: string) =>
    (await admin.execute(sql`SELECT id FROM code_sets WHERE org_id = ${orgId} AND is_source ORDER BY id`)).map((r) => (r as { id: string }).id);

  it("chuyển dữ liệu: SHARED nếu có, không thì bộ is_default (XNK); chạy lại không đổi; org đã có nguồn gốc giữ nguyên", async () => {
    await admin.execute(sql`UPDATE code_sets SET is_source = false`);
    await admin.execute(sql`INSERT INTO code_sets (id, org_id, kind, name, created_at) VALUES ('cst_b_shared', 'org_khac', 'SHARED', 'Mã chung', '2027-01-01T00:00:00Z')`);
    for (const stmt of migrationSql("0040_catalog_source_set.sql")) await admin.execute(sql.raw(stmt));
    expect(await sourceOf("org_anphat")).toEqual(["cst_mig_org_anphat"]);
    expect(await sourceOf("org_khac")).toEqual(["cst_b_shared"]);
    for (const stmt of migrationSql("0040_catalog_source_set.sql")) await admin.execute(sql.raw(stmt));
    expect(await sourceOf("org_anphat")).toEqual(["cst_mig_org_anphat"]);
    expect(await sourceOf("org_khac")).toEqual(["cst_b_shared"]);
    await admin.execute(sql`DELETE FROM code_sets WHERE id = 'cst_b_shared'`);
    await admin.execute(sql`UPDATE code_sets SET is_source = true WHERE id = 'cst_mig_org_khac'`);
  });

  it("unique is_source: bộ thứ hai cùng org bị DB chặn; org khác độc lập", async () => {
    const base = { partnerName: null, partnerKey: null, isPrimaryDisplay: false, isDefault: false, createdAt: now, updatedAt: now };
    const e = await uow.asOrg(A, (r) => r.codeSets.insert({ ...base, orgId: A.orgId, id: "cst_src2", kind: "WAREHOUSE", name: "Kho 2", isSource: true })).then(() => null, (x: unknown) => x);
    expect(isDuplicate(e, "code_sets_org_source_uq")).toBe(true);
    expect(await sourceOf("org_khac")).toEqual(["cst_mig_org_khac"]);
  });

  it("hàng chờ: cột factor (numeric → chuỗi gọn) + item_fields (jsonb); org khác không thấy", async () => {
    const setId = (await uow.asOrg(A, (r) => r.codeSets.list(A.orgId))).find((s) => s.isDefault)!.id;
    await uow.asOrg(A, (r) =>
      r.queue.insert({
        id: "cmq_src1", orgId: A.orgId, importId: null, codeSetId: setId, code: "Q1", name: "Q", unit: "PCE", hsCode: null, level: "NONE", suggestedItemId: null, candidates: [], reason: "NO_MATCH",
        status: "PENDING", decidedBy: null, decidedAt: null, sourceRef: null, factor: "12.5", itemFields: { kind: "MATERIAL", vatRate: "8" }, createdAt: now, updatedAt: now,
      }),
    );
    expect(await uow.asOrg(A, (r) => r.queue.get(A.orgId, "cmq_src1"))).toMatchObject({ factor: "12.5", itemFields: { kind: "MATERIAL", vatRate: "8" } });
    expect(await uow.asOrg(B, (r) => r.queue.get(B.orgId, "cmq_src1"))).toBeNull();
  });

  it("đổi bộ nguồn gốc trên Postgres: quy đổi + hệ số theo lô dòng tờ khai chia lại, field_audit; lỗi giữa chừng → rollback cả mặt hàng, quy đổi, dòng tờ khai", async () => {
    const deps = { uow, members: { eligibleOwners: async () => new Set<string>() }, jobs: noJobs, documents: noDocs, clock: { now: () => now }, idGen: ulidIdGen };
    const ctx = { ...A, role: "ADMIN" as const };
    await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_src', 'org_anphat', 'SRC-1', 'NK', 'A11', 'X', '02CI', '2026-11-30', 'usr_chau')`);
    await admin.execute(sql`INSERT INTO line_items (id, org_id, dossier_id, line_no, description, quantity, unit, unit_price, amount, origin, catalog_item_id, unit_factor) VALUES
      ('itm_src1', 'org_anphat', 'dos_src', 1, 'Thép', '2', 'TNE', '5', '10', 'CN', 'rb1', '2500'), ('itm_src2', 'org_anphat', 'dos_src', 2, 'Ốc', '2', 'PCE', '5', '10', 'CN', 'rb2', '3')`);
    await uow.asOrg(A, async (r) => {
      await r.codeSets.insert({ id: "cst_rb_acc", orgId: A.orgId, kind: "ACCOUNTING", name: "KT", partnerName: null, partnerKey: null, isPrimaryDisplay: false, isDefault: false, isSource: false, createdAt: now, updatedAt: now });
      await r.items.insert(item("rb1", A.orgId, "MH-400001", { baseUnit: "KGM" }));
      await r.items.insert(item("rb2", A.orgId, "MH-400002", { baseUnit: "PCE" }));
      await r.conversions.upsert({ id: "ucv_rb1", orgId: A.orgId, itemId: "rb1", unit: "TNE", factor: "1000", createdAt: now, updatedAt: now });
      await r.aliases.insert({ ...alias("ali_rb1", A.orgId, "cst_rb_acc", "rb1", "RB1", "ACTIVE"), unit: "TNE" });
      await r.aliases.insert({ ...alias("ali_rb2", A.orgId, "cst_rb_acc", "rb2", "RB2", "ACTIVE"), unit: "SET" });
    });
    // Org khác không đọc được hệ số theo lô của org A.
    expect(await uow.asOrg(B, (r) => r.lineFactors.listForItems(B.orgId, ["rb1"]))).toEqual([]);

    // Lỗi sau khi đã đổi gốc trong transaction → không còn dấu vết nào.
    const rb1 = (await uow.asOrg(A, (r) => r.items.get(A.orgId, "rb1")))!;
    await expect(
      uow.asOrg(A, async (r) => {
        expect((await rebaseItemTo(deps, r, A, rb1, "TNE", [])).kind).toBe("REBASED");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await uow.asOrg(A, (r) => r.items.get(A.orgId, "rb1")))?.baseUnit).toBe("KGM");
    expect((await admin.execute(sql`SELECT unit_factor::text AS f FROM line_items WHERE id = 'itm_src1'`))[0]).toEqual({ f: "2500.000000000" });

    const res = await changeSourceSet(deps, ctx, { codeSetId: "cst_rb_acc" });
    if (!res.ok) throw new Error(JSON.stringify(res.error));
    expect(res.value).toMatchObject({ changed: true, rebased: 1, blocked: [{ itemId: "rb2", code: "RB2", baseUnit: "PCE", newUnit: "SET" }] });
    expect(await sourceOf("org_anphat")).toEqual(["cst_rb_acc"]);
    expect((await uow.asOrg(A, (r) => r.items.get(A.orgId, "rb1")))?.baseUnit).toBe("TNE");
    expect((await uow.asOrg(A, (r) => r.conversions.listForItem(A.orgId, "rb1"))).map((c) => [c.unit, Number(c.factor)])).toEqual([["KGM", 0.001]]);
    expect(await admin.execute(sql`SELECT id, unit_factor::text AS f FROM line_items WHERE dossier_id = 'dos_src' ORDER BY id`)).toEqual([{ id: "itm_src1", f: "2.500000000" }, { id: "itm_src2", f: "3.000000000" }]);
    const audit = await admin.execute(sql`SELECT dossier_id, key, old_value, new_value FROM field_audit WHERE source = 'CATALOG_EDIT' AND dossier_id IN ('rb1', 'dos_src') ORDER BY key`);
    expect(audit).toEqual(expect.arrayContaining([
      { dossier_id: "rb1", key: "baseUnit", old_value: "KGM", new_value: "TNE" },
      { dossier_id: "dos_src", key: "unitFactor:1", old_value: "2500", new_value: "2.5" },
    ]));
    // Org khác không đổi được bộ nguồn gốc của org A.
    expect(await changeSourceSet(deps, { ...B, role: "ADMIN" }, { codeSetId: "cst_mig_org_anphat" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    // Trả lại nguồn gốc cũ (bộ XNK) cho các test khác.
    const back = await changeSourceSet(deps, ctx, { codeSetId: "cst_mig_org_anphat" });
    expect(back.ok).toBe(true);
  }, 60_000);
});
