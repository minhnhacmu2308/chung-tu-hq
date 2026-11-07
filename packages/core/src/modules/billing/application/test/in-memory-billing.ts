// Fake cho test use case billing: dữ liệu trong mảng, mô phỏng RLS (chỉ dòng của org đang đặt; không ngữ cảnh chỉ đọc payments).
import { dec } from "../../../../shared/decimal.js";
import type { OrgId, UserId } from "../../../../shared/ids.js";
import type { BillingLookupRepos, BillingRepos, BillingUow, ContractRow, GatewayPaymentStatus, LedgerRow, PaymentGateway, PaymentRow, PlanRow, WebhookPayment } from "../ports.js";

export class InMemoryBillingUow implements BillingUow {
  ledger: LedgerRow[] = [];
  payments: PaymentRow[] = [];
  contracts: ContractRow[] = [];

  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: BillingRepos) => Promise<T>): Promise<T> {
    const org = ctx.orgId as string;
    const own = (orgId: string) => {
      // Như policy RLS: ghi/đọc dòng của org khác → lỗi / không thấy.
      if (orgId !== org) throw new Error(`new row violates row-level security policy (org ${orgId} ≠ ${org})`);
    };
    return fn({
      ledger: {
        insert: async (row) => {
          own(row.orgId);
          if (this.ledger.some((l) => l.id === row.id)) return false;
          this.ledger.push(structuredClone(row));
          return true;
        },
        balance: async (orgId) => this.ledger.filter((l) => l.orgId === org && l.orgId === orgId).reduce((n, l) => n + l.delta, 0),
        firstAt: async (orgId) => this.ledger.filter((l) => l.orgId === org && l.orgId === orgId).map((l) => l.at).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
        list: async (orgId, limit) => structuredClone(this.ledger.filter((l) => l.orgId === org && l.orgId === orgId).sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)),
        countDeclarations: async (orgId, from, to) =>
          this.ledger.filter((l) => l.orgId === org && l.orgId === orgId && (l.reason === "CHARGE" || l.reason === "CONTRACT_USE") && l.at >= from && l.at < to).length,
      },
      payments: {
        insert: async (row) => {
          own(row.orgId);
          if (this.payments.some((p) => p.orderCode === row.orderCode)) throw new Error("duplicate key value violates unique constraint payments_order_code_uq");
          this.payments.push(structuredClone(row));
        },
        get: async (orgId, id) => structuredClone(this.payments.find((p) => p.orgId === org && p.orgId === orgId && p.id === id) ?? null),
        update: async (orgId, id, patch) => {
          const p = this.payments.find((x) => x.orgId === org && x.orgId === orgId && x.id === id);
          if (p) Object.assign(p, structuredClone(patch));
        },
        listRecent: async (orgId, limit) => structuredClone(this.payments.filter((p) => p.orgId === org && p.orgId === orgId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit)),
      },
      contracts: { get: async (orgId) => structuredClone(this.contracts.find((c) => c.orgId === org && c.orgId === orgId) ?? null) },
    });
  }

  system<T>(fn: (r: BillingLookupRepos) => Promise<T>): Promise<T> {
    return fn({
      payments: {
        findByOrderCode: async (orderCode) => structuredClone(this.payments.find((p) => p.orderCode === orderCode) ?? null),
        orderCodeExists: async (orderCode) => this.payments.some((p) => p.orderCode === orderCode),
        listPending: async (before, limit) => structuredClone(this.payments.filter((p) => p.status === "PENDING" && p.createdAt < before).slice(0, limit)),
      },
    });
  }

  balanceOf(orgId: string) {
    return this.ledger.filter((l) => l.orgId === orgId).reduce((n, l) => n + l.delta, 0);
  }
}

/** Cổng thanh toán giả cho test: ghi lại link đã tạo; trạng thái tra cứu đặt được; webhook nhận body `{ orderCode, amount, success, sig: "ok" }`. */
export class StubPaymentGateway implements PaymentGateway {
  readonly provider = "PAYOS" as const;
  mode: "fake" | "payos" = "payos";
  links: Parameters<PaymentGateway["createLink"]>[0][] = [];
  status = new Map<number, GatewayPaymentStatus>();
  failCreate = false;
  async createLink(input: Parameters<PaymentGateway["createLink"]>[0]) {
    if (this.failCreate) throw new Error("PayOS 500");
    this.links.push(input);
    return { checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}`, paymentLinkId: `pl_${input.orderCode}` };
  }
  async getStatus(orderCode: number) {
    return this.status.get(orderCode) ?? { status: "PENDING" as const, amount: 0, raw: {} };
  }
  verifyWebhook(body: unknown): WebhookPayment | null {
    const b = body as { orderCode?: number; amount?: number; success?: boolean; sig?: string } | null;
    return b?.sig === "ok" && typeof b.orderCode === "number" && typeof b.amount === "number" ? { orderCode: b.orderCode, amount: b.amount, success: b.success ?? true, raw: { orderCode: b.orderCode } } : null;
  }
}

export const PAYG_PLAN: PlanRow = { code: "PAYG", name: "Theo lượt", kind: "PAYG", pagesPerDossier: 40, priceVnd: "0", pricePerDeclarationVnd: "25000.000000" };
export const CONTRACT_PLAN: PlanRow = { code: "CONTRACT", name: "Hợp đồng năm", kind: "CONTRACT", pagesPerDossier: 100, priceVnd: "0", pricePerDeclarationVnd: "0" };
export const vnd = (v: string) => dec(v).toFixed(0);
