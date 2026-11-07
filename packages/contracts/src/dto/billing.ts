// Gói dịch vụ & lượt khai (ADR 0011): PAYG – trả trước theo lượt (1 lượt = 1 tờ khai nhánh được Hải quan chấp nhận khai chính thức),
// CONTRACT – hợp đồng năm, khai không giới hạn trong hạn. Số dư = tổng `delta` của sổ lượt (credit_ledger), không có cột số dư.
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema } from "../common.js";

/** Mã gói trong bảng plans. Hiện mỗi loại gói có đúng một dòng cùng tên mã. */
export const PlanCodeSchema = z.enum(["PAYG", "CONTRACT"]);
export type PlanCode = z.infer<typeof PlanCodeSchema>;

/** Loại gói: PAYG = theo lượt (trả trước qua PayOS), CONTRACT = hợp đồng năm (bán theo liên hệ). */
export const PlanKindSchema = z.enum(["PAYG", "CONTRACT"]);
export type PlanKind = z.infer<typeof PlanKindSchema>;

/**
 * Tình trạng hợp đồng theo ngày giờ VN: ACTIVE (chưa tới ngày kết thúc hoặc chưa có ngày kết thúc), EXPIRING (còn ≤ 30 ngày – vẫn khai được),
 * GRACE (quá hạn ≤ 7 ngày – vẫn khai được), EXPIRED (quá hạn > 7 ngày – khóa khai tạm lần đầu).
 */
export const ContractStatusSchema = z.enum(["ACTIVE", "EXPIRING", "GRACE", "EXPIRED"]);
export type ContractStatus = z.infer<typeof ContractStatusSchema>;

/** Gói của doanh nghiệp như khách thấy. `pricePerDeclarationVnd` chỉ có nghĩa với PAYG (CONTRACT = 0). */
export const OrgPlanSchema = z.object({
  code: PlanCodeSchema,
  name: z.string(),
  kind: PlanKindSchema,
  pagesPerDossier: z.number().int().nonnegative(),
  pricePerDeclarationVnd: DecimalStringSchema,
});
export type OrgPlan = z.infer<typeof OrgPlanSchema>;

/** `daysLeft`: số ngày tới ngày kết thúc (âm = đã quá hạn); null khi hợp đồng chưa có ngày kết thúc. */
export const OrgContractSchema = z.object({
  contractNo: z.string().nullable(),
  startsOn: IsoDateSchema.nullable(),
  endsOn: IsoDateSchema.nullable(),
  status: ContractStatusSchema,
  daysLeft: z.number().int().nullable(),
});
export type OrgContract = z.infer<typeof OrgContractSchema>;

/**
 * Lượt của doanh nghiệp. `reserved` = số tờ khai nhánh đã có số (đã khai tạm) nhưng chưa khai chính thức – sẽ trừ lượt khi Hải quan chấp nhận.
 * `available` = balance − reserved (có thể âm trong ca hiếm hai lô gửi song song). `contract` chỉ có với gói CONTRACT.
 */
export const OrgBillingSchema = z.object({
  balance: z.number().int(),
  reserved: z.number().int().nonnegative(),
  available: z.number().int(),
  contract: OrgContractSchema.nullable(),
  /** Số tờ khai nhánh đã được Hải quan chấp nhận khai chính thức trong tháng (giờ VN) – đã trừ lượt (PAYG) hoặc đếm theo hợp đồng. */
  declarationsThisMonth: z.number().int().nonnegative(),
});
export type OrgBilling = z.infer<typeof OrgBillingSchema>;

export const CreditReasonSchema = z.enum(["PURCHASE", "MANUAL_TOPUP", "GRANT", "CHARGE", "CONTRACT_USE", "REFUND", "ADJUST"]);
export type CreditReason = z.infer<typeof CreditReasonSchema>;

/** Một dòng sổ lượt (append-only). `amountVnd`: PURCHASE = tiền thu; CHARGE = doanh thu ghi nhận (delta × đơn giá lúc trừ); GRANT/CONTRACT_USE = 0. */
export const CreditLedgerEntrySchema = z.object({
  id: z.string(),
  at: IsoDateTimeSchema,
  delta: z.number().int(),
  reason: CreditReasonSchema,
  amountVnd: DecimalStringSchema,
  unitPriceVnd: DecimalStringSchema,
  dossierId: z.string().nullable(),
  branch: z.number().int().positive().nullable(),
  /** Số tờ khai – string (bất biến 2). */
  declarationNo: z.string().nullable(),
  paymentId: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string(),
});
export type CreditLedgerEntry = z.infer<typeof CreditLedgerEntrySchema>;

export const PaymentStatusSchema = z.enum(["PENDING", "PAID", "CANCELLED", "EXPIRED"]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentSchema = z.object({
  id: z.string(),
  provider: z.literal("PAYOS"),
  /** Mã đơn PayOS – số nguyên dương duy nhất. */
  orderCode: z.number().int().positive(),
  credits: z.number().int().positive(),
  amountVnd: DecimalStringSchema,
  status: PaymentStatusSchema,
  checkoutUrl: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  paidAt: IsoDateTimeSchema.nullable(),
});
export type Payment = z.infer<typeof PaymentSchema>;

/** GET /api/org/billing – màn Cài đặt → Gói & sử dụng. `ledger`: 50 dòng sổ lượt gần nhất; `payments`: thanh toán gần đây. */
export const BillingOverviewSchema = z.object({
  plan: OrgPlanSchema,
  /** Thanh toán online (PayOS) đang bật. false (PAYMENT_PROVIDER=none) → ẩn/khóa "Mua lượt", hướng dẫn liên hệ để nạp lượt. */
  onlinePaymentEnabled: z.boolean(),
  billing: OrgBillingSchema,
  ledger: z.array(CreditLedgerEntrySchema),
  payments: z.array(PaymentSchema),
});
export type BillingOverview = z.infer<typeof BillingOverviewSchema>;

export const MAX_CREDITS_PER_PURCHASE = 1000;

/** POST /api/org/billing/checkout – mua lượt (chỉ OWNER/ADMIN, chỉ gói PAYG). */
export const StartPurchaseInputSchema = z.object({
  credits: z.number().int("Nhập số nguyên").min(1, "Ít nhất 1 lượt").max(MAX_CREDITS_PER_PURCHASE, "Tối đa 1.000 lượt mỗi lần mua"),
});
export type StartPurchaseInput = z.infer<typeof StartPurchaseInputSchema>;

/** Chuyển trình duyệt sang `checkoutUrl` (trang thanh toán PayOS; bản giả lập quay về /settings?tab=plan&payment=…&fake=1). */
export const StartPurchaseResultSchema = z.object({ paymentId: z.string(), checkoutUrl: z.string() });
export type StartPurchaseResult = z.infer<typeof StartPurchaseResultSchema>;
