import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { DrizzleDeclarationUow } from "./drizzle-uow.js";

let t: TestDb;
let db: Db;
let uow: DrizzleDeclarationUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const row = (orgId: string, kho: string) => ({ id: `dp_${orgId}_${kho}`, orgId, direction: "NK" as const, values: { KHO: kho }, overrides: { KHO: { sources: ["an.warehouse", "profile.KHO"] } }, updatedBy: "usr_chau", updatedAt: new Date("2026-10-15T01:00:00Z") });

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

describe("declaration_profiles (RLS)", () => {
  it("upsert ghi đè theo (org, chiều); đọc lại đúng jsonb; org khác không thấy, không ghi hộ được", async () => {
    await uow.asOrg(A, (r) => r.profiles.upsert(row("org_anphat", "03CCS01")));
    await uow.asOrg(A, (r) => r.profiles.upsert(row("org_anphat", "02CIS01")));
    expect(await uow.asOrg(A, (r) => r.profiles.get("org_anphat", "NK"))).toMatchObject({ values: { KHO: "02CIS01" }, overrides: { KHO: { sources: ["an.warehouse", "profile.KHO"] } } });
    expect(await uow.asOrg(A, (r) => r.profiles.get("org_anphat", "XK"))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.profiles.get("org_anphat", "NK"))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.profiles.upsert(row("org_anphat", "HACK")))).rejects.toThrow();
  });
});
