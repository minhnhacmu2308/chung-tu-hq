import type { DecimalString, PaymentStatus, PlanKind } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";

export type PlanRow = { code: string; name: string; kind: PlanKind; pagesPerDossier: number; priceVnd: DecimalString; pricePerDeclarationVnd: DecimalString };
export interface PlansReader {
  get(code: string): Promise<PlanRow | null>;
}
export interface OrgPlanReader {
  get(orgId: string): Promise<{ planCode: string; createdAt: Date } | null>;
}

export type LedgerReason = "PURCHASE" | "MANUAL_TOPUP" | "GRANT" | "CHARGE" | "CONTRACT_USE" | "REFUND" | "ADJUST";
export type LedgerRow = {
  id: string; orgId: string; delta: number; reason: LedgerReason; amountVnd: DecimalString; unitPriceVnd: DecimalString;
  dossierId: string | null; branch: number | null; declarationNo: string | null; paymentId: string | null; note: string | null; createdBy: string; at: Date;
};
export type PaymentRow = {
  id: string; orgId: string; provider: "PAYOS"; orderCode: number; credits: number; amountVnd: DecimalString; status: PaymentStatus;
  checkoutUrl: string | null; paymentLinkId: string | null; createdBy: string; createdAt: Date; paidAt: Date | null; raw: Record<string, unknown> | null;
};
export type ContractRow = { orgId: string; contractNo: string | null; startsOn: string | null; endsOn: string | null; valueVnd: DecimalString };

/** Repo trong một transaction có ngữ cảnh org (RLS). Sổ lượt chỉ thêm dòng, không sửa/xóa. */
export interface BillingRepos {
  ledger: {
    /** `insert … on conflict (id) do nothing`; trả true khi thật sự thêm dòng. */
    insert(row: LedgerRow): Promise<boolean>;
    balance(orgId: string): Promise<number>;
    /** Thời điểm dòng sổ lượt đầu tiên của org (mốc bắt đầu tính lượt – đối soát không ghi hồi tố trước mốc này). */
    firstAt(orgId: string): Promise<Date | null>;
    list(orgId: string, limit: number): Promise<LedgerRow[]>;
    /** Số dòng CHARGE + CONTRACT_USE trong [from, to) – số tờ khai đã tính. */
    countDeclarations(orgId: string, from: Date, to: Date): Promise<number>;
  };
  payments: {
    insert(row: PaymentRow): Promise<void>;
    get(orgId: string, id: string): Promise<PaymentRow | null>;
    update(orgId: string, id: string, patch: Partial<Pick<PaymentRow, "status" | "checkoutUrl" | "paymentLinkId" | "paidAt" | "raw">>): Promise<void>;
    listRecent(orgId: string, limit: number): Promise<PaymentRow[]>;
  };
  contracts: { get(orgId: string): Promise<ContractRow | null> };
}

/** Đọc khi không có ngữ cảnh org: webhook PayOS (tìm theo mã đơn), job đối soát (thanh toán còn chờ của mọi org). Chỉ bảng payments. */
export interface BillingLookupRepos {
  payments: {
    findByOrderCode(orderCode: number): Promise<PaymentRow | null>;
    orderCodeExists(orderCode: number): Promise<boolean>;
    listPending(createdBefore: Date, limit: number): Promise<PaymentRow[]>;
  };
}

export interface BillingUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: BillingRepos) => Promise<T>): Promise<T>;
  system<T>(fn: (r: BillingLookupRepos) => Promise<T>): Promise<T>;
}

/** Trạng thái thanh toán theo cổng (PayOS PROCESSING coi như PENDING). */
export type GatewayPaymentStatus = { status: PaymentStatus; amount: number; raw: Record<string, unknown> };
export type WebhookPayment = { orderCode: number; amount: number; success: boolean; raw: Record<string, unknown> };

/** Cổng thanh toán (PayOS thật / giả lập). Khóa bí mật nằm trong hiện thực, không bao giờ trả ra ngoài. */
export interface PaymentGateway {
  readonly provider: "PAYOS";
  /** `fake` = giả lập (dev/mock/test): có route giả lập "đã trả". */
  readonly mode: "fake" | "payos";
  /** `expiredAt`: hạn link (unix giây) – trùng hạn của đơn trong hệ thống để PayOS không nhận tiền sau khi đơn đã hết hạn. */
  createLink(input: { orderCode: number; amount: number; description: string; returnUrl: string; cancelUrl: string; expiredAt: number; items?: { name: string; quantity: number; price: number }[] }): Promise<{ checkoutUrl: string; paymentLinkId: string | null }>;
  getStatus(orderCode: number): Promise<GatewayPaymentStatus>;
  /** Chữ ký đúng → dữ liệu đơn; sai / thiếu → null. */
  verifyWebhook(body: unknown): WebhookPayment | null;
}

export type BillingDeps = {
  plans: PlansReader;
  orgPlan: OrgPlanReader;
  /** Mức dùng tháng hiện tại: hồ sơ/trang từ dossiers, chi phí theo nhà cung cấp từ usage_events. */
  usage: { thisMonth(orgId: string, now: Date): Promise<{ dossiers: number; pages: number; aiCostVnd: DecimalString; hsCostVnd: DecimalString; customsCostVnd: DecimalString }> };
  clock: Clock;
  uow: BillingUow;
  idGen: IdGen;
  /** Số tờ khai nhánh đã có số (đã khai tạm) nhưng chưa khai chính thức – module integration cung cấp qua container. Thiếu → 0. */
  reserved?: (orgId: string) => Promise<number>;
  gateway?: PaymentGateway;
  /** APP_URL – dựng returnUrl/cancelUrl và checkoutUrl giả lập. */
  appUrl: string;
  /** Số ngẫu nhiên [0, 1) cho mã đơn PayOS (test truyền hàm cố định). Thiếu → Math.random. */
  random?: () => number;
  /** Log một dòng (không chứa khóa). Thiếu → console.error. */
  log?: (msg: string, meta?: Record<string, unknown>) => void;
};
