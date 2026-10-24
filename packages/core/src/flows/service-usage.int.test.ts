// Chi phí HSCodePro / Customs Hub trên Postgres thật: ghi usage_events (kb_app, RLS), chống ghi trùng theo khóa,
// tổng tháng tách theo nhà cung cấp (màn "Gói & sử dụng") và báo cáo quản trị (kb_platform) đếm dòng/thông điệp.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { usageEvents } from "../db/schema/billing.js";
import { runSeed } from "../db/seed/index.js";
import { startTestDb, type TestDb } from "../db/test-db.js";
import { withCtx } from "../db/with-ctx.js";
import { dec } from "../shared/decimal.js";
import { asOrgId, asUserId } from "../shared/ids.js";
import { createServiceUsageMeter, DrizzleServiceUsageMeter, DrizzleUsageRecorder, usageIdFor } from "../modules/billing/infrastructure/index.js";
import { DrizzleAdminUow } from "../modules/admin/infrastructure/drizzle-uow.js";

let t: TestDb;
let app: Db;
let platform: Db;
const ORG = "org_anphat";
const ctx = (orgId: string) => ({ orgId: asOrgId(orgId), userId: asUserId("") });

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  app = createDb(t.appUrl, { max: 2 });
  platform = createDb(t.platformUrl, { max: 2 });
});
afterAll(async () => {
  await app?.close();
  await platform?.close();
  await t?.stop();
});

describe("DrizzleServiceUsageMeter", () => {
  it("ghi HSCodePro/Customs Hub với chi phí theo đơn giá cấu hình; cùng khóa chống trùng chỉ ghi 1 dòng; org khác không thấy", async () => {
    const meter = createServiceUsageMeter(app, { HSCODEPRO_PRICE_PER_ITEM_VND: "1500.5", CUSTOMS_HUB_PRICE_PER_MESSAGE_VND: "2200" });
    await meter.record({ orgId: ORG, dossierId: null, provider: "HSCODEPRO", kind: "HS_CLASSIFY", operation: "CLASSIFY", quantity: 4, dedupeKey: "hscodepro:create:job-1", meta: { externalJobId: "job-1" } });
    await meter.record({ orgId: ORG, dossierId: null, provider: "HSCODEPRO", kind: "HS_CLASSIFY", operation: "CLASSIFY", quantity: 4, dedupeKey: "hscodepro:create:job-1" });
    await meter.record({ orgId: ORG, dossierId: null, provider: "HSCODEPRO", kind: "HS_RESULT", operation: "POLL", quantity: 4 });
    await meter.record({ orgId: ORG, dossierId: null, provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", operation: "IDA", quantity: 1, dedupeKey: "customs:dos_x:IDA:v1" });
    await meter.record({ orgId: ORG, dossierId: null, provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", operation: "IDA", quantity: 1, dedupeKey: "customs:dos_x:IDA:v1" });
    await meter.record({ orgId: ORG, dossierId: null, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: "IID", quantity: 1 });

    const rows = await withCtx(app, ctx(ORG), (tx) => tx.select().from(usageEvents).where(sql`${usageEvents.provider} in ('HSCODEPRO', 'CUSTOMS_HUB')`));
    expect(rows).toHaveLength(4);
    const classify = rows.find((r) => r.kind === "HS_CLASSIFY")!;
    expect(classify).toMatchObject({ id: usageIdFor("hscodepro:create:job-1"), provider: "HSCODEPRO", model: null, costVnd: "6002.000000", costUsd: "0.000000" });
    expect(classify.meta).toMatchObject({ operation: "CLASSIFY", quantity: 4, unitPriceVnd: "1500.5", externalJobId: "job-1", dedupeKey: "hscodepro:create:job-1" });
    expect(rows.find((r) => r.kind === "HS_RESULT")!.costVnd).toBe("0.000000");
    expect(rows.filter((r) => r.kind.startsWith("CUSTOMS_")).map((r) => r.costVnd)).toEqual(["2200.000000", "2200.000000"]);
    // RLS: doanh nghiệp khác không đọc được.
    expect(await withCtx(app, ctx("org_khac"), (tx) => tx.select().from(usageEvents))).toEqual([]);
  });

  it("tổng tháng tách AI / HSCodePro / Customs Hub (màn Gói & sử dụng); usage AI cùng dedupeKey chỉ ghi một lần", async () => {
    const ai = new DrizzleUsageRecorder(app, dec("25000"));
    await ai.record({ orgId: ORG, dossierId: null, documentId: null, kind: "AI_EXTRACT", provider: "claude", model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 0, dedupeKey: "ai:extract:k1" });
    await ai.record({ orgId: ORG, dossierId: null, documentId: null, kind: "AI_EXTRACT", provider: "claude", model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 0, dedupeKey: "ai:extract:k1" });
    const t1 = await ai.monthlyTotals(ORG, new Date());
    // AI: 2 USD × 25.000; HSCodePro: 4 × 1.500,5 = 6.002; Customs Hub: 2 × 2.200 = 4.400 (làm tròn VND).
    expect(t1).toMatchObject({ aiCostVnd: "50000", hsCostVnd: "6002", customsCostVnd: "4400" });
    expect(await ai.monthlyTotals("org_khac", new Date())).toMatchObject({ aiCostVnd: "0", hsCostVnd: "0", customsCostVnd: "0", events: 0 });
  });

  it("đơn giá 0 (chưa cấu hình) → vẫn ghi sự kiện, chi phí 0", async () => {
    const meter = new DrizzleServiceUsageMeter(app, { hscodeproPerItemVnd: dec(0), customsHubPerMessageVnd: dec(0) });
    await meter.record({ orgId: ORG, dossierId: null, provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", operation: "IDC", quantity: 1, dedupeKey: "customs:dos_x:IDC:v1" });
    const row = await withCtx(app, ctx(ORG), async (tx) => (await tx.select().from(usageEvents).where(sql`${usageEvents.id} = ${usageIdFor("customs:dos_x:IDC:v1")}`))[0]);
    expect(row).toMatchObject({ kind: "CUSTOMS_SEND", costVnd: "0.000000", meta: expect.objectContaining({ operation: "IDC", unitPriceVnd: "0" }) });
  });

  it("báo cáo quản trị theo doanh nghiệp: lệnh gọi AI, dòng gửi HSCodePro, thông điệp Customs Hub, giá vốn theo nhà cung cấp", async () => {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const rows = await new DrizzleAdminUow(platform).run((r) => r.usage.byOrg(from, to));
    expect(rows.find((x) => x.orgId === ORG)).toMatchObject({ aiCalls: 1, hsItems: 4, customsMessages: 3, readCostVnd: "50000.000000", hsCostVnd: "6002.000000", customsCostVnd: "4400.000000" });
  });
});
