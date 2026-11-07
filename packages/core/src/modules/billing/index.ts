// PUBLIC API của module billing (ADR 0011): gói PAYG/CONTRACT, sổ lượt, thanh toán PayOS, chi phí dịch vụ. Hạ tầng qua "@kb/core/modules/billing/infrastructure" (chỉ container.ts).
export type {
  BillingDeps, BillingLookupRepos, BillingRepos, BillingUow, ContractRow, GatewayPaymentStatus, LedgerReason, LedgerRow, OrgPlanReader, PaymentGateway, PaymentRow, PlanRow, PlansReader, WebhookPayment,
} from "./application/ports.js";
export { getOrgBilling, getPlanUsage, type PlanUsage } from "./application/get-org-billing.js";
export { getBillingOverview } from "./application/get-billing-overview.js";
export { checkDeclarationAllowance } from "./application/check-declaration-allowance.js";
export { createDeclarationBilling, recordDeclared } from "./application/record-declared.js";
export { paymentReturnUrl, startCreditPurchase } from "./application/start-credit-purchase.js";
export { applyPaymentWebhook, simulatePaymentPaid, syncPayment } from "./application/payments.js";
export { reconcileBilling, type ReconcileInput, type ReconcileReport } from "./application/reconcile-billing.js";
export { toLedgerEntry, toOrgContract, toOrgPlan, toPayment } from "./application/_billing.js";
export { contractCoversMonth, contractStatus, CONTRACT_GRACE_DAYS, CONTRACT_WARN_DAYS, vnMonthOf, type ContractState } from "./domain/contract.js";
export { allowanceDecision, availableCredits, ledgerKeys, LOW_CREDITS, SIGNUP_GRANT_CREDITS, type AllowanceDecision, type AllowanceInput } from "./domain/credits.js";
export { payosDescription, paymentRequestSignature, verifyWebhookSignature, webhookSignature } from "./domain/payos.js";
