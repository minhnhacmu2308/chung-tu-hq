// Sổ lượt / thanh toán / hợp đồng trên Postgres thật với role kb_app (RLS): org A không đọc/ghi được của org B; trùng khóa không ghi 2 lần.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { LedgerRow, PaymentRow } from "../application/ports.js";
import { DrizzleBillingUow } from "./drizzle-billing-uow.js";
import { DrizzlePlansRepo } from "./drizzle-plan-repo.js";

let t: TestDb;
let admin: Db;
let app: Db;
let uow: DrizzleBillingUow;
const A = { orgId: asOrgId("org_a"), userId: asUserId("") };
const B = { orgId: asOrgId("org_b"), userId: asUserId("") };
const row = (id: string, orgId: string, delta: number, over: Partial<LedgerRow> = {}): LedgerRow => ({
  id, orgId, delta, reason: "GRANT", amountVnd: "0", unitPriceVnd: "0", dossierId: null, branch: null, declarationNo: null, paymentId: null, note: null, createdBy: "system", at: new Date("2026-11-05T00:00:00Z"), ...over,
});
const payment = (id: string, orgId: string, orderCode: number, createdAt = new Date("2026-11-07T00:00:00Z")): PaymentRow => ({
  id, orgId, provider: "PAYOS", orderCode, credits: 10, amountVnd: "250000", status: "PENDING", checkoutUrl: null, paymentLinkId: null, createdBy: "usr_a", createdAt, paidAt: null, raw: null,
});

beforeAll(async () => {
  t = await startTestDb();
  admin = createDb(t.adminUrl, { max: 1 });
  app = createDb(t.appUrl, { max: 2 });
  await admin.execute(sql`insert into organizations (id, tax_code, name, plan_code) values ('org_a', '0100000001', 'A', 'PAYG'), ('org_b', '0100000002', 'B', 'CONTRACT')`);
  await admin.execute(sql`insert into org_contracts (org_id, contract_no, starts_on, ends_on, value_vnd, created_by) values ('org_b', 'HĐ-B', '2026-01-01', '2026-12-31', 120000000, 'stf')`);
  uow = new DrizzleBillingUow(app);
}, 120_000);
afterAll(async () => {
  await app?.close();
  await admin?.close();
  await t?.stop();
});

describe("DrizzleBillingUow", () => {
  it("sổ lượt: thêm dòng (trùng id → false), số dư, đếm tờ khai trong tháng, mốc đầu tiên; org khác không thấy", async () => {
    expect(await uow.asOrg(A, (r) => r.ledger.insert(row("grant:a", "org_a", 5)))).toBe(true);
    expect(await uow.asOrg(A, (r) => r.ledger.insert(row("grant:a", "org_a", 5)))).toBe(false);
    await uow.asOrg(A, (r) => r.ledger.insert(row("charge:org_a:1", "org_a", -1, { reason: "CHARGE", amountVnd: "25000", declarationNo: "1", at: new Date("2026-11-06T00:00:00Z") })));
    expect(await uow.asOrg(A, (r) => r.ledger.balance("org_a"))).toBe(4);
    expect(await uow.asOrg(A, (r) => r.ledger.countDeclarations("org_a", new Date("2026-10-31T17:00:00Z"), new Date("2026-11-30T17:00:00Z")))).toBe(1);
    expect(await uow.asOrg(A, (r) => r.ledger.firstAt("org_a"))).toEqual(new Date("2026-11-05T00:00:00Z"));
    expect((await uow.asOrg(A, (r) => r.ledger.list("org_a", 10))).map((l) => l.id)).toEqual(["charge:org_a:1", "grant:a"]);
    // RLS: org B đọc sổ lượt của A → không thấy; ghi dòng cho A → bị chặn.
    expect(await uow.asOrg(B, (r) => r.ledger.balance("org_a"))).toBe(0);
    expect(await uow.asOrg(B, (r) => r.ledger.list("org_a", 10))).toEqual([]);
    await expect(uow.asOrg(B, (r) => r.ledger.insert(row("hack", "org_a", 100)))).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/row-level security/) }) });
  });
  it("thanh toán: ghi/đọc trong org; không ngữ cảnh tìm theo mã đơn + đơn còn chờ; org khác không thấy; mã đơn trùng → lỗi unique", async () => {
    await uow.asOrg(A, (r) => r.payments.insert(payment("pay_1", "org_a", 111, new Date("2026-11-07T00:00:00Z"))));
    await expect(uow.asOrg(A, (r) => r.payments.insert(payment("pay_dup", "org_a", 111)))).rejects.toThrow();
    expect(await uow.asOrg(B, (r) => r.payments.get("org_a", "pay_1"))).toBeNull();
    expect((await uow.system((r) => r.payments.findByOrderCode(111)))?.id).toBe("pay_1");
    expect(await uow.system((r) => r.payments.orderCodeExists(111))).toBe(true);
    expect((await uow.system((r) => r.payments.listPending(new Date("2026-11-08T00:00:00Z"), 10))).map((p) => p.id)).toEqual(["pay_1"]);
    await uow.asOrg(A, (r) => r.payments.update("org_a", "pay_1", { status: "PAID", paidAt: new Date("2026-11-07T01:00:00Z"), raw: { source: "webhook" } }));
    expect(await uow.asOrg(A, (r) => r.payments.get("org_a", "pay_1"))).toMatchObject({ status: "PAID", raw: { source: "webhook" } });
    expect(await uow.system((r) => r.payments.listPending(new Date("2026-11-08T00:00:00Z"), 10))).toEqual([]);
  });
  it("hợp đồng: khách đọc được hợp đồng của chính mình, không của org khác; gói đọc từ plans", async () => {
    expect(await uow.asOrg(B, (r) => r.contracts.get("org_b"))).toMatchObject({ contractNo: "HĐ-B", startsOn: "2026-01-01", endsOn: "2026-12-31", valueVnd: "120000000.000000" });
    expect(await uow.asOrg(A, (r) => r.contracts.get("org_b"))).toBeNull();
    expect(await new DrizzlePlansRepo(app).get("PAYG")).toMatchObject({ kind: "PAYG", pricePerDeclarationVnd: "25000.000000", pagesPerDossier: 40 });
  });
});
