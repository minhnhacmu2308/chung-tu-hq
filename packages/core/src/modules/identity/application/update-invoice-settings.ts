import type { InvoiceSettingsInput, Organization } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import type { Result } from "../../../shared/result.js";
import { canManageOrg } from "../domain/role-rules.js";
import { getOrganization } from "./get-organization.js";
import type { IdentityDeps } from "./ports.js";

/** Cài đặt hóa đơn xuất khẩu (mẫu số, người ký, tên người bán in trên hóa đơn thương mại). Chỉ Quản trị / Chủ sở hữu. */
export async function updateInvoiceSettings(deps: IdentityDeps, ctx: Ctx, input: InvoiceSettingsInput): Promise<Result<Organization>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  await deps.uow.asOrg(ctx, (r) =>
    r.orgs.update(ctx.orgId, { invoiceNumberPattern: input.numbering.pattern, invoiceNumberReset: input.numbering.reset, invoiceSignatoryName: input.signatoryName, invoiceSignatoryTitle: input.signatoryTitle, invoiceSellerName: input.sellerName }),
  );
  await deps.audit?.record(ctx, { action: "ORG_INVOICE_SETTINGS", targetType: "organization", targetId: ctx.orgId, targetLabel: "invoice_settings" });
  return getOrganization(deps, ctx);
}
