// Gói & sử dụng, mua lượt (mock) – cùng quy tắc backend (mocks/billing-sim.ts). Cổng thanh toán giả: checkout quay về
// /settings?tab=plan&payment=…&fake=1, đồng bộ giữ PENDING, "Giả lập đã thanh toán" (simulatePaymentPaid) → PAID.
import { StartPurchaseInputSchema, type StartPurchaseInput } from "@kb/contracts";
import { ApiError, mutate, query } from "@/lib/mock-request";
import { billingOverview, simulatePaid, startPurchase, syncPayment as syncMock } from "@/mocks/billing-sim";
import { settleCustoms } from "./customs";

export const billingKeys = {
  overview: ["billing", "overview"] as const,
};

export const getBillingOverview = () =>
  query((db) => {
    settleCustoms(db);
    return billingOverview(db);
  });

export const startCreditPurchase = (input: StartPurchaseInput) =>
  mutate((db) => {
    const v = StartPurchaseInputSchema.safeParse(input);
    if (!v.success) throw new ApiError("VALIDATION", v.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    return startPurchase(db, v.data.credits);
  });

export const syncPayment = (id: string) => mutate((db) => syncMock(db, id));

export const simulatePaymentPaid = (id: string) => mutate((db) => simulatePaid(db, id));
