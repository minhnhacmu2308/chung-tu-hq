import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { ProductRow } from "../application/ports.js";
import { DrizzleDeclarationUow } from "./drizzle-uow.js";

let t: TestDb;
let db: Db;
let uow: DrizzleDeclarationUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const at = new Date("2026-10-22T03:00:00Z");
const row = (orgId: string, n: number, v: Partial<ProductRow> = {}): ProductRow => ({
  id: `prd_${orgId}_${n}`, orgId, key: `code:${n}`, nameKey: `mặt hàng ${n}`, code: String(n), name: `Mặt hàng ${n}`, hsCode: "33030000", unit: "UNA", origin: "FR", tariffSchedule: "B01",
  importDutyRate: "18", vatRate: null, note: null, source: "IMPORT", timesDeclared: 1, lastDeclarationNo: "108091566221", lastDeclarationDate: "2026-03-27",
  lastTypeCode: "A44", raw: { "Số TK": "108091566221", "Tên hàng": `Mặt hàng ${n}` }, updatedBy: "usr_chau", createdAt: at, updatedAt: at, ...v,
});

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  db = createDb(t.appUrl, { max: 2 });
  uow = new DrizzleDeclarationUow(db);
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("product_catalog (RLS)", () => {
  it("thêm lô lớn, đọc theo khóa, sửa, xóa; trùng khóa trong org bị chặn; org khác không thấy, không ghi/xóa hộ được", async () => {
    await uow.asOrg(A, (r) => r.products.insert(Array.from({ length: 600 }, (_, i) => row("org_anphat", i))));
    expect(await uow.asOrg(A, (r) => r.products.list("org_anphat"))).toHaveLength(600);
    const [p] = await uow.asOrg(A, (r) => r.products.byKeys("org_anphat", ["code:7", "code:nope"]));
    expect(await uow.asOrg(A, (r) => r.products.byNameKeys("org_anphat", ["mặt hàng 9"]))).toMatchObject([{ code: "9" }]);
    expect(p).toMatchObject({ code: "7", lastDeclarationDate: "2026-03-27", raw: { "Số TK": "108091566221" }, source: "IMPORT" });

    await uow.asOrg(A, (r) => r.products.update({ ...p!, hsCode: "33049930", timesDeclared: 4 }));
    expect(await uow.asOrg(A, (r) => r.products.get("org_anphat", p!.id))).toMatchObject({ hsCode: "33049930", timesDeclared: 4 });
    await expect(uow.asOrg(A, (r) => r.products.insert([row("org_anphat", 7, { id: "prd_dup" })]))).rejects.toThrow();

    expect(await uow.asOrg(B, (r) => r.products.list("org_anphat"))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.products.get("org_anphat", p!.id))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.products.insert([row("org_anphat", 9999)]))).rejects.toThrow();
    expect(await uow.asOrg(B, (r) => r.products.remove("org_anphat", [p!.id]))).toBe(0);
    // Cùng khóa ở org khác là dữ liệu riêng
    await uow.asOrg(B, (r) => r.products.insert([row("org_khac", 7)]));

    expect(await uow.asOrg(A, (r) => r.products.remove("org_anphat", [p!.id, "prd_org_anphat_8"]))).toBe(2);
    expect(await uow.asOrg(A, (r) => r.products.list("org_anphat"))).toHaveLength(598);
  });
});
