import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { allowanceDecision } from "../domain/credits.js";
import { getOrgBilling } from "./get-org-billing.js";
import type { BillingDeps } from "./ports.js";

/**
 * Chặn trước khi gửi khai tạm lần đầu của tờ khai nhánh (spec §4.2) – gọi từ use case gửi (integration) qua cổng DeclarationBilling.
 * PAYG: available (bỏ các tờ của chính lần gửi đã nằm trong reserved) ≥ sheetsToStart, thiếu → INSUFFICIENT_CREDITS (402) kèm { needed, available }.
 * CONTRACT: EXPIRED → CONTRACT_EXPIRED (402); GRACE vẫn cho gửi.
 */
export async function checkDeclarationAllowance(deps: BillingDeps, orgId: string, input: { sheetsToStart: number; ownReserved?: number }): Promise<Result<void>> {
  if (input.sheetsToStart <= 0) return ok(undefined);
  const b = await getOrgBilling(deps, orgId);
  if (!b) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ của doanh nghiệp"));
  const d = allowanceDecision({
    kind: b.plan.kind, balance: b.billing.balance, reserved: b.billing.reserved, sheetsToStart: input.sheetsToStart,
    ...(input.ownReserved !== undefined ? { ownReserved: input.ownReserved } : {}), contract: b.billing.contract?.status ?? null,
  });
  if (d.ok) return ok(undefined);
  if (d.code === "INSUFFICIENT_CREDITS") return err(reasonError("INSUFFICIENT_CREDITS", "INSUFFICIENT_CREDITS", { needed: d.needed, available: d.available }, { needed: d.needed, available: d.available }));
  // endsOn dạng YYYY-MM-DD (bất biến 4) – giao diện định dạng theo ngôn ngữ.
  return err(reasonError("CONTRACT_EXPIRED", "CONTRACT_EXPIRED", { endsOn: b.billing.contract?.endsOn ?? "" }));
}
