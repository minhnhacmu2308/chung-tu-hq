// value_charges: chi phí người khai nhập – đọc/ghi jsonb (parse Zod khi đọc), ghi đè theo (org, hồ sơ), RLS theo org.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { ValueChargesRow } from "../application/ports.js";
import { DrizzleDeclarationUow } from "./drizzle-uow.js";

let t: TestDb;
let db: Db;
let admin: Db;
let uow: DrizzleDeclarationUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const row = (orgId: string, amount: string): ValueChargesRow => ({
  id: `vc_${orgId}`, orgId, dossierId: "dos_vc", updatedBy: "usr_chau", updatedAt: new Date("2026-10-23T01:00:00Z"),
  data: { freight: { amount, currency: "USD", reason: "FORWARDER_NOTICE", note: "" }, insurance: { mode: "NONE" }, adjustments: [{ code: "A", kind: "AD", amount: "50", currency: "USD", note: "", allocate: true }] },
});

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  admin = createDb(t.adminUrl, { max: 1 });
  await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_vc', 'org_anphat', 'VC-1', 'NK', 'A11', 'X', '02CI', '2026-10-30', 'usr_chau')`);
  db = createDb(t.appUrl, { max: 2 });
  uow = new DrizzleDeclarationUow(db);
});
afterAll(async () => {
  await db?.close();
  await admin?.close();
  await t?.stop();
});

describe("value_charges (RLS)", () => {
  it("upsert ghi đè theo (org, hồ sơ); đọc lại đúng jsonb; org khác không thấy, không ghi hộ được", async () => {
    await uow.asOrg(A, (r) => r.valueCharges.upsert(row("org_anphat", "900")));
    await uow.asOrg(A, (r) => r.valueCharges.upsert(row("org_anphat", "1200")));
    expect(await uow.asOrg(A, (r) => r.valueCharges.get("org_anphat", "dos_vc"))).toMatchObject({ data: { freight: { amount: "1200" }, insurance: { mode: "NONE" }, adjustments: [{ code: "A" }] } });
    expect(await uow.asOrg(B, (r) => r.valueCharges.get("org_anphat", "dos_vc"))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.valueCharges.upsert(row("org_anphat", "1")))).rejects.toThrow();
  });
});
