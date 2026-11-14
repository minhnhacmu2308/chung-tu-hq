// C7 – field_audit cùng transaction với lệnh sửa (bất biến 6): repo `fieldAudit` trong uow của declaration / catalog / integration
// ghi vào bảng dùng chung field_audit trên CÙNG transaction – commit cùng nhau, lỗi trong callback rollback cả hai; RLS theo org.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./client.js";
import { runSeed } from "./seed/index.js";
import { startTestDb, type TestDb } from "./test-db.js";
import { asOrgId, asUserId } from "../shared/ids.js";
import { DrizzleCatalogUow } from "../modules/catalog/infrastructure/drizzle-catalog-uow.js";
import { DrizzleCustomsUow } from "../modules/integration/infrastructure/drizzle-customs-uow.js";
import { DrizzleDeclarationUow } from "../modules/declaration/infrastructure/drizzle-uow.js";

let t: TestDb;
let db: Db;
let admin: Db;
let uow: DrizzleDeclarationUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const AT = new Date("2026-11-14T03:00:00.000Z");

const unitFactor = async () => (await admin.execute(sql`select unit_factor from line_items where id = 'itm_fa1'`))[0]?.unit_factor ?? null;
const auditRows = async (key: string) => admin.execute(sql`select org_id, dossier_id, key, old_value, new_value, user_id, source, at from field_audit where key = ${key}`);

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  admin = createDb(t.adminUrl, { max: 1 });
  await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_fa', 'org_anphat', 'FA-1', 'NK', 'A11', 'X', '02CI', '2026-11-30', 'usr_chau')`);
  await admin.execute(sql`INSERT INTO line_items (id, org_id, dossier_id, line_no, description, quantity, unit, unit_price, amount, origin) VALUES ('itm_fa1', 'org_anphat', 'dos_fa', 1, 'Vải', '10', 'ROL', '5', '50', 'CN')`);
  db = createDb(t.appUrl, { max: 2 });
  uow = new DrizzleDeclarationUow(db);
});
afterAll(async () => {
  await db?.close();
  await admin?.close();
  await t?.stop();
});

describe("field_audit trong uow (C7)", () => {
  it("sửa dòng + field_audit commit cùng nhau; người sửa = ctx.userId, at = giờ truyền vào", async () => {
    await uow.asOrg(A, async (r) => {
      await r.lineItems.update(A.orgId, "itm_fa1", { unitFactor: "95", updatedAt: AT });
      await r.fieldAudit.append(A, AT, [{ dossierId: "dos_fa", key: "unitFactor:1", oldValue: "", newValue: "95", source: "CATALOG_EDIT" }]);
    });
    expect(Number(await unitFactor())).toBe(95);
    const rows = await auditRows("unitFactor:1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ org_id: "org_anphat", dossier_id: "dos_fa", old_value: "", new_value: "95", user_id: "usr_chau", source: "CATALOG_EDIT" });
    expect(new Date(rows[0]!.at as string).toISOString()).toBe(AT.toISOString());
  });

  it("lỗi ném trong callback sau khi đã sửa + ghi audit → rollback cả hai", async () => {
    await expect(
      uow.asOrg(A, async (r) => {
        await r.lineItems.update(A.orgId, "itm_fa1", { unitFactor: "50", updatedAt: AT });
        await r.fieldAudit.append(A, AT, [{ dossierId: "dos_fa", key: "unitFactor:rollback", oldValue: "95", newValue: "50", source: "CATALOG_EDIT" }]);
        throw new Error("crash giữa chừng");
      }),
    ).rejects.toThrow("crash giữa chừng");
    expect(Number(await unitFactor())).toBe(95);
    expect(await auditRows("unitFactor:rollback")).toHaveLength(0);
  });

  it("RLS: org khác không đọc được dòng audit, không ghi hộ org khác được", async () => {
    expect(await uow.asOrg(A, (r) => r.fieldAudit.listForObject(A.orgId, "dos_fa", "CATALOG_EDIT", 10))).toEqual([expect.objectContaining({ key: "unitFactor:1", userId: "usr_chau" })]);
    expect(await uow.asOrg(B, (r) => r.fieldAudit.listForObject(A.orgId, "dos_fa", "CATALOG_EDIT", 10))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.fieldAudit.listForObject(B.orgId, "dos_fa", "CATALOG_EDIT", 10))).toEqual([]);
    await expect(uow.asOrg(B, (r) => r.fieldAudit.append(A, AT, [{ dossierId: "dos_fa", key: "x", oldValue: "", newValue: "y", source: "DECL_EDIT" }]))).rejects.toThrow();
  });

  it("nhiều ô một lần ghi giữ thứ tự (mới nhất trước khi đọc lịch sử); uow catalog và integration cùng ghi được bảng dùng chung", async () => {
    const at = new Date("2026-11-14T04:00:00.000Z");
    const cat = new DrizzleCatalogUow(db);
    await cat.asOrg(A, (r) => r.fieldAudit.append(A, at, ["a", "b", "c"].map((k) => ({ dossierId: "cat_fa", key: k, oldValue: "", newValue: k, source: "CATALOG_EDIT" as const }))));
    expect((await cat.asOrg(A, (r) => r.fieldAudit.listForObject(A.orgId, "cat_fa", "CATALOG_EDIT", 10))).map((x) => x.key)).toEqual(["c", "b", "a"]);
    const customs = new DrizzleCustomsUow(db);
    await customs.asOrg(A, (r) => r.fieldAudit.append(A, at, [{ dossierId: "dos_fa", key: "ama:1:TK_REF", oldValue: "", newValue: "R", source: "AMA_EDIT" }]));
    expect(await auditRows("ama:1:TK_REF")).toHaveLength(1);
  });

  it("listForObject: lọc theo đối tượng + nguồn, mới nhất trước, giới hạn số dòng", async () => {
    const cat = new DrizzleCatalogUow(db);
    const e = (key: string, source: "CATALOG_EDIT" | "DECL_EDIT" = "CATALOG_EDIT", dossierId = "itm_lf1") => ({ dossierId, key, oldValue: "a", newValue: "b", source });
    await cat.asOrg(A, async (r) => {
      await r.fieldAudit.append(A, new Date("2026-11-13T01:00:00Z"), [e("item")]);
      await r.fieldAudit.append(A, new Date("2026-11-13T02:00:00Z"), [e("name")]);
      await r.fieldAudit.append(A, new Date("2026-11-13T03:00:00Z"), [e("hsCode")]);
      await r.fieldAudit.append(A, new Date("2026-11-13T04:00:00Z"), [e("other", "DECL_EDIT")]);
      await r.fieldAudit.append(A, new Date("2026-11-13T05:00:00Z"), [e("name", "CATALOG_EDIT", "itm_lf2")]);
    });
    const got = await cat.asOrg(A, (r) => r.fieldAudit.listForObject(A.orgId, "itm_lf1", "CATALOG_EDIT", 2));
    expect(got.map((a) => a.key)).toEqual(["hsCode", "name"]);
    expect(got[0]).toMatchObject({ userId: "usr_chau", oldValue: "a", newValue: "b", source: "CATALOG_EDIT" });
  });
});
