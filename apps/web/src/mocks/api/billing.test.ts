// Gói & lượt của bản mock (ADR 0011) – cùng quy tắc backend: mua lượt (cổng giả), đồng bộ → PAID + cộng lượt, chặn khai tạm khi thiếu lượt,
// IDC được chấp nhận → trừ 1 lượt (một lần theo số tờ khai), hợp đồng hết hạn chặn khai.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { addLedger, balanceOf } from "@/mocks/billing-sim";
import { getBillingOverview, simulatePaymentPaid, startCreditPurchase, syncPayment } from "./billing";
import { getSubmission, performOperation, submitDeclaration } from "./customs";
import { getOrganization } from "./settings";

vi.mock("@/mocks/hys-sim", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/mocks/hys-sim")>()), pendingSuggestions: () => [] }));
vi.mock("@/lib/mock-request", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/mock-request")>();
  return {
    ...real,
    query: async <T,>(fn: (db: ReturnType<typeof getDb>) => T) => structuredClone(fn(getDb())),
    mutate: async <T,>(fn: (db: ReturnType<typeof getDb>) => T) => {
      const r = fn(getDb());
      saveDb();
      return structuredClone(r);
    },
  };
});

const NEW = "dos_024"; // NK, đã duyệt, chưa khai – luôn luồng xanh
const CERT = "cert_vnpt";
const ORG = "org_anphat";
const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);
const fail = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; status?: number; reason?: string; params?: unknown }) => ({ code: e.code, status: e.status, reason: e.reason, params: e.params }));
/** Đưa số dư về `n` lượt (điều chỉnh tay trong sổ lượt). */
const setBalance = (n: number) => addLedger(getDb(), { id: `adj:test:${Math.random()}`, orgId: ORG, at: new Date().toISOString(), delta: n - balanceOf(getDb(), ORG), reason: "ADJUST", createdBy: "test" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T03:00:00Z"));
  resetDb();
});
afterEach(() => vi.useRealTimers());

describe("gói & sổ lượt (mock)", () => {
  it("doanh nghiệp demo dùng gói Theo lượt; số dư = tổng sổ lượt; khách không thấy giá vốn", async () => {
    const org = await getOrganization();
    expect(org.plan).toEqual({ code: "PAYG", name: "Theo lượt", kind: "PAYG", pagesPerDossier: 40, pricePerDeclarationVnd: "25000" });
    expect(org.billing.balance).toBe(balanceOf(getDb(), ORG));
    expect(org.billing.balance).toBeGreaterThan(0);
    expect(org.usage).toEqual({ dossiersThisMonth: expect.any(Number), pagesThisMonth: expect.any(Number) });
    const o = await getBillingOverview();
    expect(o.ledger.length).toBeGreaterThan(0);
    expect(o.ledger.every((l) => !("orgId" in l))).toBe(true);
  });

  it("mua lượt: checkout giả về /settings?tab=plan&payment=…&fake=1; đồng bộ giữ PENDING (như FakePaymentGateway); giả lập đã trả → PAID, cộng đúng một lần", async () => {
    const before = balanceOf(getDb(), ORG);
    const r = await startCreditPurchase({ credits: 10 });
    expect(r.checkoutUrl).toBe(`/settings?tab=plan&payment=${r.paymentId}&fake=1`);
    expect((await getBillingOverview()).payments[0]).toMatchObject({ id: r.paymentId, status: "PENDING", credits: 10, amountVnd: "250000" });
    expect((await syncPayment(r.paymentId)).status).toBe("PENDING");
    expect((await simulatePaymentPaid(r.paymentId)).status).toBe("PAID");
    expect((await simulatePaymentPaid(r.paymentId)).status).toBe("PAID");
    expect((await syncPayment(r.paymentId)).status).toBe("PAID");
    expect(balanceOf(getDb(), ORG)).toBe(before + 10);
    expect((await getBillingOverview()).ledger[0]).toMatchObject({ reason: "PURCHASE", delta: 10, amountVnd: "250000", paymentId: r.paymentId });
  });

  it("thanh toán online tắt → overview báo onlinePaymentEnabled=false; mua / đồng bộ báo PAYMENT_NOT_CONFIGURED", async () => {
    expect((await getBillingOverview()).onlinePaymentEnabled).toBe(true);
    getDb().billing.onlinePaymentEnabled = false;
    expect((await getBillingOverview()).onlinePaymentEnabled).toBe(false);
    expect(await fail(startCreditPurchase({ credits: 5 }))).toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED", reason: "PAYMENT_NOT_CONFIGURED" });
  });

  it("mua lượt: chỉ OWNER/ADMIN; 1–1000 lượt; gói Hợp đồng năm không mua", async () => {
    expect((await fail(startCreditPurchase({ credits: 0 })))?.code).toBe("VALIDATION");
    expect((await fail(startCreditPurchase({ credits: 1001 })))?.code).toBe("VALIDATION");
    getDb().currentUserId = "usr_ha";
    expect((await fail(startCreditPurchase({ credits: 5 })))?.code).toBe("FORBIDDEN");
    getDb().currentUserId = "usr_chau";
    getDb().org.plan = { ...getDb().org.plan, code: "CONTRACT" };
    expect((await fail(startCreditPurchase({ credits: 5 })))?.code).toBe("INVALID_STATE");
  });
});

describe("chặn khai tạm / trừ lượt (mock, như backend)", () => {
  it("thiếu lượt → INSUFFICIENT_CREDITS (402) kèm needed/available; không gửi", async () => {
    setBalance(0);
    expect(await fail(submitDeclaration(NEW, CERT))).toEqual({ code: "INSUFFICIENT_CREDITS", status: 402, reason: "INSUFFICIENT_CREDITS", params: { needed: 1, available: 0 } });
    expect((await getSubmission(NEW)).stage).toBe("NOT_SENT");
  });

  it("đủ lượt → khai tạm (lượt đang giữ +1, khả dụng −1); IDC được chấp nhận → trừ 1 lượt CHARGE, một lần theo số tờ khai", async () => {
    setBalance(2);
    await submitDeclaration(NEW, CERT);
    wait(3_000);
    let org = await getOrganization();
    expect(org.billing).toMatchObject({ balance: 2, reserved: 1, available: 1 });
    await performOperation(NEW, "IDC");
    wait(3_000);
    await getSubmission(NEW);
    org = await getOrganization();
    expect(org.billing).toMatchObject({ balance: 1, reserved: 0, available: 1 });
    const no = (await getSubmission(NEW)).result?.declarationNo;
    const charges = getDb().billing.ledger.filter((l) => l.reason === "CHARGE" && l.declarationNo === no);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ id: `charge:${ORG}:${no}`, delta: -1, amountVnd: "25000", dossierId: NEW });
  });

  it("gói Hợp đồng năm hết hạn quá 7 ngày → CONTRACT_EXPIRED; đang ân hạn vẫn khai được, IDC ghi CONTRACT_USE (không trừ lượt)", async () => {
    getDb().org.plan = { ...getDb().org.plan, code: "CONTRACT" };
    getDb().billing.contracts[ORG] = { contractNo: "HĐ-1", endsOn: "2026-10-25", valueVnd: "0" };
    expect(await fail(submitDeclaration(NEW, CERT))).toMatchObject({ code: "CONTRACT_EXPIRED", params: { endsOn: "2026-10-25" } });
    getDb().billing.contracts[ORG]!.endsOn = "2026-11-03";
    const before = balanceOf(getDb(), ORG);
    await submitDeclaration(NEW, CERT);
    wait(3_000);
    await performOperation(NEW, "IDC");
    wait(3_000);
    await getSubmission(NEW);
    expect(getDb().billing.ledger[0]).toMatchObject({ reason: "CONTRACT_USE", delta: 0 });
    expect(balanceOf(getDb(), ORG)).toBe(before);
  });
});
