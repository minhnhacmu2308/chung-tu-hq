// Gói & sử dụng (PAYG / Hợp đồng năm), sổ lượt, mua lượt PayOS – ADR 0011. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/billing";
import * as http from "./http/billing";

export const billingKeys = mock.billingKeys;
export type { BillingOverview, CreditLedgerEntry, Payment, StartPurchaseInput, StartPurchaseResult } from "@kb/contracts";

export const getBillingOverview = pick(mock.getBillingOverview, http.getBillingOverview);
export const startCreditPurchase = pick(mock.startCreditPurchase, http.startCreditPurchase);
export const syncPayment = pick(mock.syncPayment, http.syncPayment);
export const simulatePaymentPaid = pick(mock.simulatePaymentPaid, http.simulatePaymentPaid);
