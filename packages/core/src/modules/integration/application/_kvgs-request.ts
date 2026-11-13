// Dựng yêu cầu gửi cổng cho danh sách container (V5ContainerReq/Res) và KVGS từ hồ sơ + tờ khai đã được cấp số (ADR 0014).
import { domainError } from "../../../shared/errors.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { ContainerListGatewayRequest, CustomsDeps, KvgsGatewayRequest } from "./customs-ports.js";
import { officeCode } from "./kvgs.js";

export type RefHead = Omit<ContainerListGatewayRequest, "rows">;
export type RefRequests = { head: RefHead; kvgs: KvgsGatewayRequest };

/**
 * Đầu yêu cầu của tờ khai nhánh `branch`: số tờ khai + ngày đăng ký (từ kết quả truyền), mã loại hình, đơn vị Hải quan, doanh nghiệp (người nhập khẩu NK / người xuất khẩu XK),
 * USER_ID tài khoản VNACCS (rỗng nếu chưa cấu hình – gateway thật từ chối trước khi gọi FPT). Thiếu số tờ khai / ngày đăng ký → INVALID_STATE (không gọi cổng).
 */
export async function loadRefRequests(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string, branch: number): Promise<Result<RefRequests>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(ctx.orgId, dossierId, branch));
  const declarationNo = result?.declarationNo;
  const registeredOn = result?.raw?.customsInfo?.registeredDate;
  if (!declarationNo || !registeredOn) return err(domainError("INVALID_STATE", "Tờ khai chưa có số hoặc ngày đăng ký – chưa thể gửi danh sách container"));
  const fields = snap?.payload.fields ?? {};
  const nk = dossier.direction === "NK";
  const taxCode = fields[nk ? "NNK_MST" : "NXK_MST"]?.value ?? "";
  const customsOffice = officeCode(fields["CQHQ"]?.value) ?? "";
  const userId = (await deps.vnaccsUserId?.(ctx.orgId)) ?? "";
  const head: RefHead = { dossierId, declarationNo, registeredOn, typeCode: dossier.typeCode, customsOffice, taxCode, companyName: fields[nk ? "NNK_TEN" : "NXK_TEN"]?.value ?? "", userId };
  const kvgs: KvgsGatewayRequest = { dossierId, declarationNo, registeredOn, customsOffice, taxCode };
  return ok({ head, kvgs });
}
