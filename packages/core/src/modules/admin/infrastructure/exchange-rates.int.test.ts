// Tỷ giá tính thuế trên Postgres thật: kb_platform ghi, tự động không đè nhập tay, kb_app chỉ đọc.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { DrizzleAdminUow } from "./drizzle-uow.js";

let t: TestDb;
let platform: Db;
let app: Db;
let uow: DrizzleAdminUow;
const AT = new Date("2026-10-15T16:30:00Z");
const BOARD = new Date("2026-10-15T09:00:00Z");

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  platform = createDb(t.platformUrl, { max: 2 });
  app = createDb(t.appUrl, { max: 1 });
  uow = new DrizzleAdminUow(platform);
});
afterAll(async () => {
  await platform?.close();
  await app?.close();
  await t?.stop();
});

describe("exchange_rates (kb_platform)", () => {
  it("upsertAuto ghi tỷ giá VCB; nhập tay (MANUAL) không bị lần tự động sau đè; danh sách theo tuần", async () => {
    await uow.run((r) => r.exchangeRates.upsertAuto([{ currency: "USD", effectiveFrom: "2026-10-19", rate: "25710.00" }, { currency: "EUR", effectiveFrom: "2026-10-19", rate: "28535.52" }], BOARD, AT));
    await uow.run((r) => r.exchangeRates.upsertManual({ currency: "USD", effectiveFrom: "2026-10-19", rate: "25800", updatedBy: "usr_bao", note: "Sửa theo công văn" }, AT));
    await uow.run((r) => r.exchangeRates.upsertAuto([{ currency: "USD", effectiveFrom: "2026-10-19", rate: "1" }, { currency: "EUR", effectiveFrom: "2026-10-19", rate: "28600" }], BOARD, AT));
    const rows = await uow.run((r) => r.exchangeRates.list("2026-10-19"));
    expect(rows.find((x) => x.currency === "USD")).toMatchObject({ rate: "25800.000000", source: "MANUAL", updatedBy: "usr_bao", note: "Sửa theo công văn" });
    expect(rows.find((x) => x.currency === "EUR")).toMatchObject({ rate: "28600.000000", source: "VCB" });
    expect(rows.find((x) => x.currency === "EUR")!.snapshotAt?.toISOString()).toBe(BOARD.toISOString());
  });
  it("nhật ký lần lấy: latest trả lần mới nhất", async () => {
    await uow.run((r) => r.rateFetches.insert({ id: "rf_1", ranAt: new Date("2026-10-08T16:30:00Z"), effectiveFrom: "2026-10-12", status: "OK", count: 20, boardAt: BOARD, error: null }));
    await uow.run((r) => r.rateFetches.insert({ id: "rf_2", ranAt: AT, effectiveFrom: "2026-10-19", status: "FAILED", count: 0, boardAt: null, error: "HTML" }));
    expect(await uow.run((r) => r.rateFetches.latest())).toMatchObject({ id: "rf_2", status: "FAILED", error: "HTML" });
  });
  it("kb_app không ghi được exchange_rates, không đọc được exchange_rate_fetches", async () => {
    await expect(app.execute(sql`insert into exchange_rates (id, currency, date, rate) values ('x', 'JPY', '2026-10-19', '160')`)).rejects.toThrow();
    const rows = await app.execute(sql`select count(*)::int as n from exchange_rate_fetches`).catch(() => null);
    expect(rows === null || (rows as unknown as { n: number }[])[0]?.n === 0).toBe(true);
  });
});
