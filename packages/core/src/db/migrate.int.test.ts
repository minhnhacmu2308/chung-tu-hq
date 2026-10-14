import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./client.js";
import { resetSchema, runMigrations } from "./migrate.js";
import { startTestDb, type TestDb } from "./test-db.js";

let t: TestDb;
let db: Db;
beforeAll(async () => {
  t = await startTestDb();
  db = createDb(t.adminUrl, { max: 1 });
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("resetSchema", () => {
  it("reset rồi migrate lại tạo đủ bảng (không bị migrator coi là đã chạy)", async () => {
    await resetSchema(t.adminUrl);
    const before = await db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
    expect((before[0] as { n: number }).n).toBe(0);
    await runMigrations(t.adminUrl);
    const after = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    expect(after.map((r) => (r as { table_name: string }).table_name)).toContain("memberships");
  });
});
