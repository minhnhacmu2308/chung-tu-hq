import type { DeclarationBilling, DeclaredBranch } from "../../../shared/billing.js";
import { dec, toDecimalString } from "../../../shared/decimal.js";
import { ledgerKeys } from "../domain/credits.js";
import { loadPlan, SYSTEM_ACTOR, systemCtx } from "./_billing.js";
import { checkDeclarationAllowance } from "./check-declaration-allowance.js";
import type { BillingDeps } from "./ports.js";

/**
 * Tờ khai nhánh được Hải quan chấp nhận khai chính thức (D2): PAYG → CHARGE (−1 lượt, tiền = đơn giá gói lúc trừ – doanh thu ghi nhận);
 * CONTRACT → CONTRACT_USE (delta 0, chỉ đếm). Khóa `charge:<orgId>:<declarationNo>`: IDC01 / khai lại / đối soát cùng số không ghi lần 2.
 * Trả true khi thật sự ghi dòng mới. Lỗi hạ tầng ném ra – nơi gọi bọc "cố gắng hết sức" (chargeSafely).
 */
export async function recordDeclared(deps: BillingDeps, e: DeclaredBranch): Promise<boolean> {
  if (!e.declarationNo) return false;
  const plan = await loadPlan(deps, e.orgId);
  if (!plan) throw new Error(`Không tìm thấy gói của doanh nghiệp ${e.orgId}`);
  const payg = plan.kind === "PAYG";
  const unit = payg ? toDecimalString(dec(plan.pricePerDeclarationVnd), 0) : "0";
  const now = deps.clock.now();
  return deps.uow.asOrg(systemCtx(e.orgId), (r) =>
    r.ledger.insert({
      id: ledgerKeys.charge(e.orgId, e.declarationNo), orgId: e.orgId, delta: payg ? -1 : 0, reason: payg ? "CHARGE" : "CONTRACT_USE",
      amountVnd: unit, unitPriceVnd: unit, dossierId: e.dossierId, branch: e.branch, declarationNo: e.declarationNo, paymentId: null,
      note: `${e.op} được chấp nhận`, createdBy: SYSTEM_ACTOR, at: now,
    }),
  );
}

/** Hiện thực cổng DeclarationBilling (shared) cho module integration – composition root nối. */
export function createDeclarationBilling(deps: BillingDeps): DeclarationBilling {
  return {
    checkAllowance: (orgId, input) => checkDeclarationAllowance(deps, orgId, input),
    onDeclared: async (e) => void (await recordDeclared(deps, e)),
  };
}
