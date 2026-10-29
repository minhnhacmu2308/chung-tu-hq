// Tờ khai lấy tỷ giá trên Postgres thật: tỷ giá mẫu (SEED – dev/demo) không thắng tỷ giá thật (Vietcombank / nhập tay), kể cả khi mới hơn.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { DrizzleDeclarationUow } from "./drizzle-uow.js";

let t: TestDb;
let platform: Db;
let app: Db;

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl); // ghi tỷ giá SEED theo ngày chạy test
  platform = createDb(t.platformUrl, { max: 1 });
  app = createDb(t.appUrl, { max: 1 });
});
afterAll(async () => {
  await platform?.close();
  await app?.close();
  await t?.stop();
});

describe("exchangeRates.latest", () => {
  it("có tỷ giá Vietcombank cũ hơn tỷ giá mẫu → lấy Vietcombank; chỉ có tỷ giá mẫu → vẫn dùng mẫu (dev/demo)", async () => {
    const uow = new DrizzleDeclarationUow(app);
    const ctx = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
    expect(await uow.asOrg(ctx, (r) => r.exchangeRates.latest("CNY", "2099-12-31"))).toMatchObject({ source: "SEED" });
    await platform.execute(sql`insert into exchange_rates (id, currency, date, rate, source) values ('fx_CNY_2026-10-26', 'CNY', '2026-10-26', '3813.79', 'VCB')`);
    expect(await uow.asOrg(ctx, (r) => r.exchangeRates.latest("CNY", "2099-12-31"))).toMatchObject({ rate: "3813.790000", source: "VCB", date: "2026-10-26" });
  });
});
