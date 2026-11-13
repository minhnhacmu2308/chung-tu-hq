// shipments.listLatestByOrg: lô hàng mới nhất (version số lớn nhất, so theo số) mỗi hồ sơ; RLS theo org.
import { emptyShipment } from "@kb/contracts";
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
  await admin.execute(sql`INSERT INTO organizations (id, tax_code, name, plan_code) VALUES ('org_khac', '0100000098', 'KHÁC', 'PAYG')`);
  await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES
    ('dos_l1', 'org_anphat', 'L-1', 'NK', 'A11', 'X', '02CI', '2026-11-20', 'usr_chau'),
    ('dos_l2', 'org_anphat', 'L-2', 'NK', 'A11', 'X', '02CI', '2026-11-20', 'usr_chau')`);
  db = createDb(t.appUrl, { max: 2 });
  uow = new DrizzleExtractionUow(db);
}, 120_000);
afterAll(async () => {
  await db?.close();
  await admin?.close();
  await t?.stop();
});

describe("shipments.listLatestByOrg", () => {
  it("mỗi hồ sơ một lô mới nhất (version 10 > 9); org khác không thấy", async () => {
    const at = new Date("2026-11-13T00:00:00Z");
    await uow.asOrg(A, async (r) => {
      for (const [id, dossierId, version] of [["sh1", "dos_l1", 9], ["sh2", "dos_l1", 10], ["sh3", "dos_l2", 1]] as const)
        await r.shipments.insert({ id, orgId: A.orgId, dossierId, version, data: emptyShipment(), schemaVersion: "v", createdAt: at });
    });
    const got = await uow.asOrg(A, (r) => r.shipments.listLatestByOrg(A.orgId));
    expect(got.map((s) => [s.dossierId, s.version]).sort()).toEqual([["dos_l1", 10], ["dos_l2", 1]]);
    expect(await uow.asOrg(B, (r) => r.shipments.listLatestByOrg(B.orgId))).toEqual([]);
  });
});
