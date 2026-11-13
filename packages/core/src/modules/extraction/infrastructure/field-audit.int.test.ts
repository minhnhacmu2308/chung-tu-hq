// field_audit.listForObject: lịch sử theo đối tượng (cột dossier_id) + nguồn, mới nhất trước, giới hạn số dòng; RLS theo org.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { DrizzleExtractionUow } from "./drizzle-uow.js";

let t: TestDb;
let db: Db;
let admin: Db;
let uow: DrizzleExtractionUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  admin = createDb(t.adminUrl, { max: 1 });
  await admin.execute(sql`INSERT INTO organizations (id, tax_code, name, plan_code) VALUES ('org_khac', '0100000097', 'KHÁC', 'PAYG')`);
  db = createDb(t.appUrl, { max: 2 });
  uow = new DrizzleExtractionUow(db);
}, 120_000);
afterAll(async () => {
  await db?.close();
  await admin?.close();
  await t?.stop();
});

describe("field_audit.listForObject", () => {
  it("lọc theo đối tượng + nguồn, mới nhất trước, giới hạn; org khác không thấy", async () => {
    const row = (id: string, key: string, at: string, source: "CATALOG_EDIT" | "USER_EDIT" = "CATALOG_EDIT", dossierId = "itm_1") => ({
      id, orgId: A.orgId, dossierId, fieldId: null, documentId: null, key, oldValue: "a", newValue: "b", userId: A.userId, source, at: new Date(at),
    });
    await uow.asOrg(A, async (r) => {
      await r.audit.insert(row("fa1", "item", "2026-11-13T01:00:00Z"));
      await r.audit.insert(row("fa2", "name", "2026-11-13T02:00:00Z"));
      await r.audit.insert(row("fa3", "hsCode", "2026-11-13T03:00:00Z"));
      await r.audit.insert(row("fa4", "other", "2026-11-13T04:00:00Z", "USER_EDIT"));
      await r.audit.insert(row("fa5", "name", "2026-11-13T05:00:00Z", "CATALOG_EDIT", "itm_2"));
    });
    const got = await uow.asOrg(A, (r) => r.audit.listForObject(A.orgId, "itm_1", "CATALOG_EDIT", 2));
    expect(got.map((a) => a.key)).toEqual(["hsCode", "name"]);
    expect(got[0]).toMatchObject({ userId: "usr_chau", oldValue: "a", newValue: "b", source: "CATALOG_EDIT" });
    expect(await uow.asOrg(B, (r) => r.audit.listForObject(B.orgId, "itm_1", "CATALOG_EDIT", 10))).toEqual([]);
    // Truy vấn bằng orgId của A từ phiên B: RLS chặn.
    expect(await uow.asOrg(B, (r) => r.audit.listForObject(A.orgId, "itm_1", "CATALOG_EDIT", 10))).toEqual([]);
  });
});
