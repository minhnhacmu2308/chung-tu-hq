// Sổ lượt, thanh toán, hợp đồng (ADR 0011) trên kết nối kb_app – mỗi lời gọi một transaction có ngữ cảnh RLS.
import type { PaymentStatus } from "@kb/contracts";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { creditLedger, orgContracts, payments } from "../../../db/schema/billing.js";
import { withCtx, withSystem } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { BillingLookupRepos, BillingRepos, BillingUow, LedgerReason, LedgerRow, PaymentRow } from "../application/ports.js";

const toLedger = (l: typeof creditLedger.$inferSelect): LedgerRow => ({ ...l, reason: l.reason as LedgerReason });
const toPaymentRow = (p: typeof payments.$inferSelect): PaymentRow => ({
  ...p, provider: "PAYOS", status: p.status as PaymentStatus, raw: (p.raw as Record<string, unknown> | null) ?? null,
});

function repos(tx: Tx): BillingRepos {
  return {
    ledger: {
      insert: async (row) => (await tx.insert(creditLedger).values(row).onConflictDoNothing({ target: creditLedger.id }).returning({ id: creditLedger.id })).length === 1,
      balance: async (orgId) => Number((await tx.select({ n: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` }).from(creditLedger).where(eq(creditLedger.orgId, orgId)))[0]?.n ?? 0),
      firstAt: async (orgId) => {
        const v = (await tx.select({ at: sql<Date | null>`min(${creditLedger.at})`.mapWith((x) => (x ? new Date(x as string) : null)) }).from(creditLedger).where(eq(creditLedger.orgId, orgId)))[0]?.at;
        return v ?? null;
      },
      list: async (orgId, limit) => (await tx.select().from(creditLedger).where(eq(creditLedger.orgId, orgId)).orderBy(desc(creditLedger.at), desc(creditLedger.id)).limit(limit)).map(toLedger),
      countDeclarations: async (orgId, from, to) =>
        Number(
          (
            await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(creditLedger)
              .where(and(eq(creditLedger.orgId, orgId), inArray(creditLedger.reason, ["CHARGE", "CONTRACT_USE"]), gte(creditLedger.at, from), lt(creditLedger.at, to)))
          )[0]?.n ?? 0,
        ),
    },
    payments: {
      insert: async (row) => void (await tx.insert(payments).values(row)),
      get: async (orgId, id) => {
        const p = (await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.id, id))).limit(1))[0];
        return p ? toPaymentRow(p) : null;
      },
      update: async (orgId, id, patch) => void (await tx.update(payments).set(patch).where(and(eq(payments.orgId, orgId), eq(payments.id, id)))),
      listRecent: async (orgId, limit) => (await tx.select().from(payments).where(eq(payments.orgId, orgId)).orderBy(desc(payments.createdAt)).limit(limit)).map(toPaymentRow),
    },
    contracts: {
      get: async (orgId) => {
        const c = (await tx.select().from(orgContracts).where(eq(orgContracts.orgId, orgId)).limit(1))[0];
        return c ? { orgId: c.orgId, contractNo: c.contractNo, startsOn: c.startsOn, endsOn: c.endsOn, valueVnd: c.valueVnd } : null;
      },
    },
  };
}

/** Không ngữ cảnh org: chỉ đọc payments (policy payments_lookup) – webhook tìm theo mã đơn, đối soát lấy đơn còn chờ. */
function lookup(tx: Tx): BillingLookupRepos {
  return {
    payments: {
      findByOrderCode: async (orderCode) => {
        const p = (await tx.select().from(payments).where(eq(payments.orderCode, orderCode)).limit(1))[0];
        return p ? toPaymentRow(p) : null;
      },
      orderCodeExists: async (orderCode) => (await tx.select({ id: payments.id }).from(payments).where(eq(payments.orderCode, orderCode)).limit(1)).length > 0,
      listPending: async (createdBefore, limit) =>
        (await tx.select().from(payments).where(and(eq(payments.status, "PENDING"), lt(payments.createdAt, createdBefore))).orderBy(payments.createdAt).limit(limit)).map(toPaymentRow),
    },
  };
}

export class DrizzleBillingUow implements BillingUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: BillingRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
  system<T>(fn: (r: BillingLookupRepos) => Promise<T>) {
    return withSystem(this.db, (tx) => fn(lookup(tx)));
  }
}

/**
 * Ghi một dòng tặng lượt NGAY TRONG transaction của nơi gọi (đăng ký doanh nghiệp – identity, withSystem): cùng commit với việc tạo org.
 * Transaction đó không có ngữ cảnh org → đặt tạm app.org_id = org mới cho câu insert (policy credit_ledger_insert), rồi trả lại như cũ.
 * Composition root truyền hàm này cho identity (identity không đọc/ghi bảng của billing).
 */
export async function grantCreditsInTx(tx: Tx, row: { id: string; orgId: string; delta: number; note: string; createdBy: string; at: Date }): Promise<void> {
  const prev = String((await tx.execute(sql`select coalesce(current_setting('app.org_id', true), '') as v`))[0]?.v ?? "");
  await tx.execute(sql`select set_config('app.org_id', ${row.orgId}, true)`);
  await tx
    .insert(creditLedger)
    .values({ id: row.id, orgId: row.orgId, delta: row.delta, reason: "GRANT", amountVnd: "0", unitPriceVnd: "0", note: row.note, createdBy: row.createdBy, at: row.at })
    .onConflictDoNothing({ target: creditLedger.id });
  await tx.execute(sql`select set_config('app.org_id', ${prev}, true)`);
}
