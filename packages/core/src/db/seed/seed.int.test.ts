import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { memberships, organizations, users } from "../schema/index.js";
import { startTestDb, type TestDb } from "../test-db.js";
import { DEMO_ORG_ID, runSeed } from "./index.js";

let t: TestDb;
let db: Db;
beforeAll(async () => {
  t = await startTestDb();
  db = createDb(t.adminUrl, { max: 2 });
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("runSeed", () => {
  it("tạo org demo với 6 thành viên và chạy lại không nhân đôi", async () => {
    await runSeed(t.adminUrl);
    await runSeed(t.adminUrl);
    const org = await db.select().from(organizations).where(eq(organizations.id, DEMO_ORG_ID));
    expect(org).toHaveLength(1);
    expect(org[0]?.taxCode).toBe("0316789012");
    const mems = await db.select().from(memberships).where(eq(memberships.orgId, DEMO_ORG_ID));
    expect(mems).toHaveLength(6);
    expect(mems.filter((m) => m.status === "INVITED")).toHaveLength(1);
    const u = await db.select().from(users).where(eq(users.email, "chau.le@anphat-demo.vn"));
    expect(u[0]?.emailVerifiedAt).not.toBeNull();
  });
});
