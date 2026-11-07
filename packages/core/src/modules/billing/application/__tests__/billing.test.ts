import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import type { Role } from "@kb/contracts";
import { checkDeclarationAllowance } from "../check-declaration-allowance.js";
import { getBillingOverview } from "../get-billing-overview.js";
import { getOrgBilling, getPlanUsage } from "../get-org-billing.js";
import { applyPaymentWebhook, simulatePaymentPaid, syncPayment } from "../payments.js";
import type { BillingDeps, PaymentRow } from "../ports.js";
import { reconcileBilling } from "../reconcile-billing.js";
import { createDeclarationBilling, recordDeclared } from "../record-declared.js";
import { startCreditPurchase } from "../start-credit-purchase.js";
import { CONTRACT_PLAN, InMemoryBillingUow, PAYG_PLAN, StubPaymentGateway } from "../test/in-memory-billing.js";

const NOW = "2026-11-07T03:00:00.000Z";
let uow: InMemoryBillingUow;
let gateway: StubPaymentGateway;
let plans: Record<string, string>;
let reserved: Record<string, number>;
let deps: BillingDeps;
const logs: string[] = [];
const ctx = (role: Role = "OWNER", orgId = "org_a", userId = "usr_a") => ({ orgId: asOrgId(orgId), userId: asUserId(userId), role });
const grant = (orgId: string, delta: number, id = `grant:test:${orgId}:${delta}`) =>
  uow.ledger.push({ id, orgId, delta, reason: "GRANT", amountVnd: "0", unitPriceVnd: "0", dossierId: null, branch: null, declarationNo: null, paymentId: null, note: null, createdBy: "system", at: new Date("2026-11-01T00:00:00Z") });
const declared = (orgId: string, declarationNo: string, branch = 1, op = "IDC") => ({ orgId, dossierId: "dos_1", branch, declarationNo, op });

beforeEach(() => {
  uow = new InMemoryBillingUow();
  gateway = new StubPaymentGateway();
  plans = { org_a: "PAYG", org_b: "PAYG", org_c: "CONTRACT" };
  reserved = {};
  logs.length = 0;
  deps = {
    plans: { get: async (code) => (code === "PAYG" ? PAYG_PLAN : code === "CONTRACT" ? CONTRACT_PLAN : null) },
    orgPlan: { get: async (orgId) => (plans[orgId] ? { planCode: plans[orgId]!, createdAt: new Date("2026-01-01T00:00:00Z") } : null) },
    usage: { thisMonth: async () => ({ dossiers: 3, pages: 41, aiCostVnd: "12500", hsCostVnd: "4500", customsCostVnd: "2200" }) },
    clock: fixedClock(NOW),
    uow,
    idGen: sequentialIdGen(),
    reserved: async (orgId) => reserved[orgId] ?? 0,
    gateway,
    appUrl: "https://app.khaibao.vn",
    random: () => 0.5,
    log: (m) => void logs.push(m),
  };
});

describe("getPlanUsage / getOrgBilling", () => {
  it("gói + mức dùng tháng – không trả giá vốn cho khách", async () => {
    const r = unwrap(await getPlanUsage(deps, ctx("VIEWER")));
    expect(r.plan).toEqual({ code: "PAYG", name: "Theo lượt", kind: "PAYG", pagesPerDossier: 40, pricePerDeclarationVnd: "25000" });
    expect(r.usage).toEqual({ dossiersThisMonth: 3, pagesThisMonth: 41 });
  });
  it("org không có gói → NOT_FOUND", async () => {
    expect(errCode(await getPlanUsage({ ...deps, orgPlan: { get: async () => null } }, ctx()))).toBe("NOT_FOUND");
  });
  it("số dư = tổng sổ lượt; khả dụng = số dư − lượt đang giữ; hợp đồng chỉ với CONTRACT", async () => {
    grant("org_a", 10);
    reserved.org_a = 4;
    expect((await getOrgBilling(deps, "org_a"))?.billing).toEqual({ balance: 10, reserved: 4, available: 6, contract: null, declarationsThisMonth: 0 });
    uow.contracts.push({ orgId: "org_c", contractNo: "HĐ-1", startsOn: "2026-01-01", endsOn: "2026-11-20", valueVnd: "120000000" });
    expect((await getOrgBilling(deps, "org_c"))?.billing.contract).toEqual({ contractNo: "HĐ-1", startsOn: "2026-01-01", endsOn: "2026-11-20", status: "EXPIRING", daysLeft: 13 });
  });
});

describe("recordDeclared (IDC/EDC được chấp nhận)", () => {
  it("PAYG: CHARGE −1 lượt, tiền = đơn giá lúc trừ; chạy lại cùng số tờ khai không trừ lần 2 (IDC01 / khai lại)", async () => {
    grant("org_a", 5);
    expect(await recordDeclared(deps, declared("org_a", "107000000001"))).toBe(true);
    expect(await recordDeclared(deps, declared("org_a", "107000000001"))).toBe(false);
    expect(await recordDeclared(deps, declared("org_a", "107000000001", 1, "IDC01"))).toBe(false);
    expect(uow.balanceOf("org_a")).toBe(4);
    expect(uow.ledger.find((l) => l.reason === "CHARGE")).toMatchObject({
      id: "charge:org_a:107000000001", delta: -1, amountVnd: "25000", unitPriceVnd: "25000", dossierId: "dos_1", branch: 1, declarationNo: "107000000001", createdBy: "system",
    });
  });
  it("lô 3 tờ → 3 lượt (mỗi số tờ khai một lượt)", async () => {
    grant("org_a", 5);
    for (const [i, no] of ["107000000011", "107000000012", "107000000013"].entries()) await recordDeclared(deps, declared("org_a", no, i + 1));
    expect(uow.balanceOf("org_a")).toBe(2);
  });
  it("CONTRACT: CONTRACT_USE delta 0 (chỉ đếm), không có tiền", async () => {
    await recordDeclared(deps, declared("org_c", "307000000001", 1, "EDC"));
    expect(uow.ledger).toEqual([expect.objectContaining({ reason: "CONTRACT_USE", delta: 0, amountVnd: "0", note: "EDC được chấp nhận" })]);
    expect((await getOrgBilling(deps, "org_c"))?.billing.declarationsThisMonth).toBe(1);
  });
  it("cổng DeclarationBilling: onDeclared ghi đúng org; số âm có thể xảy ra (2 lô song song) – không chặn", async () => {
    const port = createDeclarationBilling(deps);
    await port.onDeclared(declared("org_b", "107000000099"));
    expect(uow.balanceOf("org_b")).toBe(-1);
    expect(uow.ledger.every((l) => l.orgId === "org_b")).toBe(true);
  });
});

describe("checkDeclarationAllowance (khai tạm lần đầu)", () => {
  it("PAYG thiếu lượt → INSUFFICIENT_CREDITS (402) kèm needed/available", async () => {
    grant("org_a", 3);
    reserved.org_a = 2;
    const r = await checkDeclarationAllowance(deps, "org_a", { sheetsToStart: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "INSUFFICIENT_CREDITS", reason: "INSUFFICIENT_CREDITS", params: { needed: 2, available: 1 } });
    expect((await checkDeclarationAllowance(deps, "org_a", { sheetsToStart: 1 })).ok).toBe(true);
  });
  it("khai chính thức cả lô: tờ đã giữ lượt không tính hai lần", async () => {
    grant("org_a", 3);
    reserved.org_a = 3;
    expect((await checkDeclarationAllowance(deps, "org_a", { sheetsToStart: 3, ownReserved: 3 })).ok).toBe(true);
    expect(errCode(await checkDeclarationAllowance(deps, "org_a", { sheetsToStart: 3 }))).toBe("INSUFFICIENT_CREDITS");
  });
  it("CONTRACT hết hạn quá 7 ngày → CONTRACT_EXPIRED; đang ân hạn → vẫn cho gửi", async () => {
    uow.contracts.push({ orgId: "org_c", contractNo: "HĐ-1", startsOn: null, endsOn: "2026-10-25", valueVnd: "0" });
    const r = await checkDeclarationAllowance(deps, "org_c", { sheetsToStart: 1 });
    if (r.ok) throw new Error("phải lỗi");
    expect(r.error).toMatchObject({ code: "CONTRACT_EXPIRED", params: { endsOn: "2026-10-25" } });
    uow.contracts[0]!.endsOn = "2026-11-03";
    expect((await checkDeclarationAllowance(deps, "org_c", { sheetsToStart: 5 })).ok).toBe(true);
  });
  it("không có tờ nào cần lượt → ok (không đọc gì)", async () => {
    expect((await checkDeclarationAllowance({ ...deps, orgPlan: { get: async () => { throw new Error("không được gọi"); } } }, "org_a", { sheetsToStart: 0 })).ok).toBe(true);
  });
  it("lượt của org khác không được tính", async () => {
    grant("org_b", 50);
    expect(errCode(await checkDeclarationAllowance(deps, "org_a", { sheetsToStart: 1 }))).toBe("INSUFFICIENT_CREDITS");
  });
});

describe("startCreditPurchase", () => {
  it("OWNER/ADMIN mua 10 lượt PAYG: đơn PENDING, tiền = 10 × đơn giá, link PayOS mô tả KB<mã đơn>, returnUrl về Gói & sử dụng", async () => {
    const r = unwrap(await startCreditPurchase(deps, ctx("ADMIN"), { credits: 10 }));
    const p = uow.payments[0]!;
    expect(p).toMatchObject({ id: r.paymentId, orgId: "org_a", status: "PENDING", credits: 10, amountVnd: "250000", checkoutUrl: r.checkoutUrl, paymentLinkId: `pl_${p.orderCode}`, createdBy: "usr_a" });
    expect(gateway.links[0]).toMatchObject({ orderCode: p.orderCode, amount: 250000, description: `KB${p.orderCode}`, returnUrl: `https://app.khaibao.vn/settings?tab=plan&payment=${r.paymentId}`,
      // Link PayOS hết hạn cùng đơn: 24 giờ sau lúc tạo (unix giây).
      expiredAt: Math.floor(new Date(NOW).getTime() / 1000) + 24 * 3600 });
    expect(gateway.links[0]!.description.length).toBeLessThanOrEqual(25);
    // Chưa cộng lượt khi chưa trả.
    expect(uow.balanceOf("org_a")).toBe(0);
  });
  it("quyền: DECLARANT/VIEWER → FORBIDDEN", async () => {
    expect(errCode(await startCreditPurchase(deps, ctx("DECLARANT"), { credits: 10 }))).toBe("FORBIDDEN");
    expect(errCode(await startCreditPurchase(deps, ctx("VIEWER"), { credits: 10 }))).toBe("FORBIDDEN");
  });
  it("biên 1–1000", async () => {
    expect(errCode(await startCreditPurchase(deps, ctx(), { credits: 0 }))).toBe("VALIDATION");
    expect(errCode(await startCreditPurchase(deps, ctx(), { credits: 1001 }))).toBe("VALIDATION");
    expect(errCode(await startCreditPurchase(deps, ctx(), { credits: 2.5 }))).toBe("VALIDATION");
    expect((await startCreditPurchase(deps, ctx(), { credits: 1 })).ok).toBe(true);
    expect((await startCreditPurchase(deps, ctx(), { credits: 1000 })).ok).toBe(true);
  });
  it("không phải PAYG → INVALID_STATE", async () => {
    expect(errCode(await startCreditPurchase(deps, ctx("OWNER", "org_c"), { credits: 10 }))).toBe("INVALID_STATE");
  });
  it("mã đơn trùng → thử số khác; PayOS lỗi → đơn CANCELLED + GATEWAY_ERROR", async () => {
    const first = unwrap(await startCreditPurchase(deps, ctx(), { credits: 2 }));
    const second = unwrap(await startCreditPurchase(deps, ctx(), { credits: 2 }));
    expect(new Set(uow.payments.map((p) => p.orderCode)).size).toBe(2);
    expect(first.paymentId).not.toBe(second.paymentId);
    gateway.failCreate = true;
    expect(errCode(await startCreditPurchase(deps, ctx(), { credits: 2 }))).toBe("GATEWAY_ERROR");
    expect(uow.payments.at(-1)?.status).toBe("CANCELLED");
  });
});

describe("applyPaymentWebhook / syncPayment", () => {
  const pending = async () => {
    const r = unwrap(await startCreditPurchase(deps, ctx(), { credits: 10 }));
    return uow.payments.find((p) => p.id === r.paymentId)!;
  };
  it("sai chữ ký → VALIDATION (route 400), không đổi gì", async () => {
    const p = await pending();
    expect(errCode(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 250000, sig: "bad" }))).toBe("VALIDATION");
    expect(uow.payments[0]!.status).toBe("PENDING");
  });
  it("đúng chữ ký + đúng tiền → PAID + PURCHASE (delta = số lượt), khóa payos:<mã đơn>; webhook lần 2 không cộng thêm", async () => {
    const p = await pending();
    expect(unwrap(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 250000, sig: "ok" }))).toEqual({ applied: true });
    expect(unwrap(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 250000, sig: "ok" }))).toEqual({ applied: false });
    expect(uow.balanceOf("org_a")).toBe(10);
    expect(uow.payments[0]).toMatchObject({ status: "PAID", paidAt: new Date(NOW) });
    expect(uow.ledger).toEqual([expect.objectContaining({ id: `payos:${p.orderCode}`, reason: "PURCHASE", delta: 10, amountVnd: "250000", unitPriceVnd: "25000", paymentId: p.id })]);
  });
  it("lệch số tiền → không cộng lượt, lưu raw + log để đối soát", async () => {
    const p = await pending();
    expect(unwrap(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 2500, sig: "ok" }))).toEqual({ applied: false });
    expect(uow.balanceOf("org_a")).toBe(0);
    expect(uow.payments[0]).toMatchObject({ status: "PENDING", raw: expect.objectContaining({ amountMismatch: true }) });
    expect(logs.join("\n")).toMatch(/Số tiền PayOS báo khác/);
  });
  it("đơn đã EXPIRED rồi PayOS báo PAID đúng tiền (khách trả trễ) → PAID + cộng lượt đúng một lần, log cảnh báo", async () => {
    const p = await pending();
    gateway.status.set(p.orderCode, { status: "EXPIRED", amount: 250000, raw: {} });
    expect(unwrap(await syncPayment(deps, ctx(), p.id)).status).toBe("EXPIRED");
    expect(unwrap(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 250000, sig: "ok" }))).toEqual({ applied: true });
    expect(unwrap(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 250000, sig: "ok" }))).toEqual({ applied: false });
    expect(uow.payments[0]).toMatchObject({ status: "PAID", raw: expect.objectContaining({ paidAfter: "EXPIRED" }) });
    expect(uow.balanceOf("org_a")).toBe(10);
    expect(uow.ledger.filter((l) => l.reason === "PURCHASE")).toHaveLength(1);
    expect(logs.join("\n")).toMatch(/đơn đã hết hạn\/hủy – vẫn cộng lượt/);
  });
  it("đơn đã chốt: webhook lỗi / lệch tiền không ghi đè raw", async () => {
    const p = await pending();
    gateway.status.set(p.orderCode, { status: "CANCELLED", amount: 250000, raw: { keep: true } });
    unwrap(await syncPayment(deps, ctx(), p.id));
    const before = structuredClone(uow.payments[0]!.raw);
    unwrap(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 250000, success: false, sig: "ok" }));
    unwrap(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 1, sig: "ok" }));
    expect(uow.payments[0]).toMatchObject({ status: "CANCELLED", raw: before });
    expect(uow.balanceOf("org_a")).toBe(0);
  });
  it("không có cổng thanh toán (PAYMENT_PROVIDER=none): mua / đồng bộ / webhook → INTEGRATION_NOT_CONFIGURED (PAYMENT_NOT_CONFIGURED); overview báo tắt", async () => {
    const p = await pending();
    delete deps.gateway;
    const buy = await startCreditPurchase(deps, ctx(), { credits: 1 });
    if (buy.ok) throw new Error("phải lỗi");
    expect(buy.error).toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED", reason: "PAYMENT_NOT_CONFIGURED" });
    expect(errCode(await syncPayment(deps, ctx(), p.id))).toBe("INTEGRATION_NOT_CONFIGURED");
    expect(errCode(await applyPaymentWebhook(deps, { orderCode: p.orderCode, amount: 250000, sig: "ok" }))).toBe("INTEGRATION_NOT_CONFIGURED");
    expect(unwrap(await getBillingOverview(deps, ctx())).onlinePaymentEnabled).toBe(false);
  });
  it("mã đơn không có (webhook thử của PayOS) → vẫn ok (200)", async () => {
    expect(unwrap(await applyPaymentWebhook(deps, { orderCode: 123, amount: 1000, sig: "ok" }))).toEqual({ applied: false });
  });
  it("syncPayment: PENDING → tra cứu PayOS; PAID áp như webhook; đã PAID thì không tra cứu lại", async () => {
    const p = await pending();
    expect(unwrap(await syncPayment(deps, ctx("VIEWER"), p.id)).status).toBe("PENDING");
    gateway.status.set(p.orderCode, { status: "PAID", amount: 250000, raw: {} });
    expect(unwrap(await syncPayment(deps, ctx("VIEWER"), p.id)).status).toBe("PAID");
    gateway.status.clear();
    expect(unwrap(await syncPayment(deps, ctx("VIEWER"), p.id)).status).toBe("PAID");
    expect(uow.balanceOf("org_a")).toBe(10);
  });
  it("syncPayment: org khác không thấy đơn → NOT_FOUND; PayOS báo CANCELLED → đơn CANCELLED", async () => {
    const p = await pending();
    expect(errCode(await syncPayment(deps, ctx("OWNER", "org_b", "usr_b"), p.id))).toBe("NOT_FOUND");
    gateway.status.set(p.orderCode, { status: "CANCELLED", amount: 250000, raw: {} });
    expect(unwrap(await syncPayment(deps, ctx(), p.id)).status).toBe("CANCELLED");
    expect(uow.balanceOf("org_a")).toBe(0);
  });
  it("giả lập đã trả chỉ với cổng giả lập", async () => {
    const p = await pending();
    expect(errCode(await simulatePaymentPaid(deps, ctx(), p.id))).toBe("NOT_SUPPORTED");
    gateway.mode = "fake";
    expect(unwrap(await simulatePaymentPaid(deps, ctx(), p.id)).status).toBe("PAID");
    expect(uow.balanceOf("org_a")).toBe(10);
  });
});

describe("getBillingOverview", () => {
  it("gói + lượt + 50 dòng sổ lượt gần nhất + thanh toán – chỉ của org mình", async () => {
    grant("org_a", 3);
    grant("org_b", 99);
    unwrap(await startCreditPurchase(deps, ctx(), { credits: 5 }));
    const o = unwrap(await getBillingOverview(deps, ctx("VIEWER")));
    expect(o.plan.kind).toBe("PAYG");
    expect(o.onlinePaymentEnabled).toBe(true);
    expect(o.billing.balance).toBe(3);
    expect(o.ledger).toHaveLength(1);
    expect(o.payments).toEqual([expect.objectContaining({ credits: 5, amountVnd: "125000", status: "PENDING" })]);
  });
});

describe("reconcileBilling", () => {
  it("ghi bù tờ khai đã được chấp nhận mà chưa có dòng sổ lượt (không trùng); since ≥ mốc sổ lượt đầu tiên", async () => {
    grant("org_a", 5);
    await recordDeclared(deps, declared("org_a", "107000000001"));
    const sinces: Date[] = [];
    const r = await reconcileBilling(deps, {
      orgIds: ["org_a"],
      declared: async (orgId, since) => {
        sinces.push(since);
        return [declared(orgId, "107000000001"), declared(orgId, "107000000002", 2)];
      },
    });
    expect(r).toMatchObject({ charged: 1, errors: 0 });
    expect(uow.balanceOf("org_a")).toBe(3);
    // Mốc = max(dòng đầu tiên 01/11, now − 7 ngày = 31/10) → 01/11.
    expect(sinces[0]).toEqual(new Date("2026-11-01T00:00:00Z"));
  });
  it("thanh toán PENDING > 15 phút: chốt theo PayOS (PAID → cộng lượt, EXPIRED); PayOS vẫn PENDING / tra cứu lỗi → giữ PENDING dù quá 24 giờ; lỗi một org không dừng cả lượt", async () => {
    const base: Omit<PaymentRow, "id" | "orderCode" | "createdAt"> = { orgId: "org_a", provider: "PAYOS", credits: 2, amountVnd: "50000", status: "PENDING", checkoutUrl: null, paymentLinkId: null, createdBy: "usr_a", paidAt: null, raw: null };
    uow.payments.push(
      { ...base, id: "pay_1", orderCode: 1, createdAt: new Date("2026-11-07T02:00:00Z") },
      { ...base, id: "pay_2", orderCode: 2, createdAt: new Date("2026-11-05T00:00:00Z") },
      { ...base, id: "pay_3", orderCode: 3, createdAt: new Date("2026-11-07T02:55:00Z") },
      { ...base, id: "pay_4", orderCode: 4, createdAt: new Date("2026-11-04T00:00:00Z") },
      { ...base, id: "pay_5", orderCode: 5, createdAt: new Date("2026-11-04T00:00:00Z") },
    );
    gateway.status.set(1, { status: "PAID", amount: 50000, raw: {} });
    gateway.status.set(4, { status: "EXPIRED", amount: 50000, raw: {} });
    const realGet = gateway.getStatus.bind(gateway);
    gateway.getStatus = async (code) => (code === 5 ? Promise.reject(new Error("PayOS 503")) : realGet(code));
    const r = await reconcileBilling(deps, { orgIds: ["org_x"], declared: async () => { throw new Error("db down"); } });
    expect(r).toEqual({ charged: 0, paid: 1, expired: 1, errors: 2 });
    expect(uow.payments.map((p) => p.status)).toEqual(["PAID", "PENDING", "PENDING", "EXPIRED", "PENDING"]);
    expect(uow.balanceOf("org_a")).toBe(2);
    expect(logs.join("\n")).toMatch(/PayOS vẫn báo PENDING/);
  });
  it("không có cổng thanh toán → không tra cứu, không đổi đơn", async () => {
    delete deps.gateway;
    uow.payments.push({ id: "pay_1", orgId: "org_a", provider: "PAYOS", orderCode: 1, credits: 2, amountVnd: "50000", status: "PENDING", checkoutUrl: null, paymentLinkId: null, createdBy: "usr_a", createdAt: new Date("2026-11-01T00:00:00Z"), paidAt: null, raw: null });
    expect(await reconcileBilling(deps, { orgIds: [], declared: async () => [] })).toEqual({ charged: 0, paid: 0, expired: 0, errors: 0 });
    expect(uow.payments[0]!.status).toBe("PENDING");
  });

});
