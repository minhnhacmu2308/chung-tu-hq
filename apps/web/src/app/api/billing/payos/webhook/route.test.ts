// Webhook PayOS (public) + route dev giả lập "đã trả": fail-closed – không có cổng / cổng giả lập ở production → 404;
// sai chữ ký → 400; đúng chữ ký + PAID → cộng lượt đúng một lần (use case billing thật trên kho in-memory).
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ env: { NODE_ENV: "test", PAYMENT_PROVIDER: "fake" } as { NODE_ENV: string; PAYMENT_PROVIDER: string }, billing: null as unknown }));
vi.mock("@/container", () => ({ getContainer: () => ({ env: state.env, billing: state.billing }) }));
vi.mock("@/lib/server/auth", () => ({ requireSession: async () => ({ ctx: { orgId: "org_a", userId: "usr_a", role: "OWNER" } }) }));

type Ledger = { id: string; orgId: string; delta: number };
type Pay = { id: string; orgId: string; orderCode: number; credits: number; amountVnd: string; status: string; raw: unknown; createdAt: Date; paidAt: Date | null };

/** Billing deps tối giản: một đơn PENDING 10 lượt / 250.000đ; cổng `mode` kiểm chữ ký `sig === "ok"`. */
function makeBilling(mode: "fake" | "payos" | null) {
  const ledger: Ledger[] = [];
  const payments: Pay[] = [{ id: "pay_1", orgId: "org_a", orderCode: 111, credits: 10, amountVnd: "250000", status: "PENDING", raw: null, createdAt: new Date(), paidAt: null }];
  const repos = {
    ledger: { insert: async (row: Ledger) => (ledger.some((l) => l.id === row.id) ? false : (ledger.push(row), true)) },
    payments: {
      get: async (_o: string, id: string) => structuredClone(payments.find((p) => p.id === id) ?? null),
      update: async (_o: string, id: string, patch: Partial<Pay>) => void Object.assign(payments.find((p) => p.id === id)!, patch),
    },
  };
  const gateway = mode && {
    provider: "PAYOS", mode,
    verifyWebhook: (b: { orderCode?: number; amount?: number; sig?: string }) => (b?.sig === "ok" ? { orderCode: b.orderCode!, amount: b.amount!, success: true, raw: {} } : null),
  };
  return {
    ledger, payments,
    deps: {
      ...(gateway ? { gateway } : {}),
      clock: { now: () => new Date() }, log: () => undefined,
      uow: { asOrg: (_c: unknown, fn: (r: typeof repos) => unknown) => fn(repos), system: (fn: (r: unknown) => unknown) => fn({ payments: { findByOrderCode: async (c: number) => structuredClone(payments.find((p) => p.orderCode === c) ?? null) } }) },
    },
  };
}

const post = async (mod: Promise<Record<string, unknown>>, url: string, body: unknown, params: Record<string, string> = {}) => {
  const handler = (await mod)["POST"] as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  return handler(new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve(params) });
};
const webhook = (body: unknown) => post(import("./route"), "http://localhost/api/billing/payos/webhook", body);

let b: ReturnType<typeof makeBilling>;
beforeEach(() => {
  state.env = { NODE_ENV: "test", PAYMENT_PROVIDER: "payos" };
  b = makeBilling("payos");
  state.billing = b.deps;
});

describe("POST /api/billing/payos/webhook", () => {
  it("sai chữ ký → 400, không đổi đơn, không cộng lượt", async () => {
    const res = await webhook({ orderCode: 111, amount: 250000, sig: "bad" });
    expect(res.status).toBe(400);
    expect(b.payments[0]!.status).toBe("PENDING");
    expect(b.ledger).toEqual([]);
  });
  it("đúng chữ ký + đúng tiền → 200 {success:true}, PAID, cộng 10 lượt đúng một lần (webhook lặp lại không cộng thêm)", async () => {
    const first = await webhook({ orderCode: 111, amount: 250000, sig: "ok" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: true });
    expect((await webhook({ orderCode: 111, amount: 250000, sig: "ok" })).status).toBe(200);
    expect(b.payments[0]!.status).toBe("PAID");
    expect(b.ledger).toEqual([expect.objectContaining({ id: "payos:111", delta: 10 })]);
  });
  it("không có cổng thanh toán (PAYMENT_PROVIDER=none) → 404", async () => {
    b = makeBilling(null);
    state.billing = b.deps;
    expect((await webhook({ orderCode: 111, amount: 250000, sig: "ok" })).status).toBe(404);
    expect(b.ledger).toEqual([]);
  });
  it("cổng giả lập ở production → 404 (không ai tự cộng lượt được)", async () => {
    b = makeBilling("fake");
    state.billing = b.deps;
    state.env = { NODE_ENV: "production", PAYMENT_PROVIDER: "fake" };
    expect((await webhook({ orderCode: 111, amount: 250000, sig: "ok" })).status).toBe(404);
    expect(b.ledger).toEqual([]);
  });
  it("chữ ký đúng mà mã đơn không có (webhook thử khi đăng ký URL) → vẫn 200", async () => {
    expect((await webhook({ orderCode: 999, amount: 1, sig: "ok" })).status).toBe(200);
  });
});

describe("POST /api/dev/payments/[id]/simulate-paid", () => {
  const simulate = () => post(import("../../../dev/payments/[id]/simulate-paid/route"), "http://localhost/api/dev/payments/pay_1/simulate-paid", {}, { id: "pay_1" });
  it("chỉ chạy khi PAYMENT_PROVIDER=fake và không production; còn lại → 404, không cộng lượt", async () => {
    for (const env of [{ NODE_ENV: "test", PAYMENT_PROVIDER: "payos" }, { NODE_ENV: "test", PAYMENT_PROVIDER: "none" }, { NODE_ENV: "production", PAYMENT_PROVIDER: "fake" }]) {
      state.env = env;
      expect((await simulate()).status).toBe(404);
    }
    expect(b.ledger).toEqual([]);
  });
  it("fake ngoài production → PAID + cộng lượt", async () => {
    b = makeBilling("fake");
    state.billing = b.deps;
    state.env = { NODE_ENV: "development", PAYMENT_PROVIDER: "fake" };
    const res = await simulate();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "PAID", credits: 10 });
    expect(b.ledger).toEqual([expect.objectContaining({ delta: 10 })]);
  });
});
