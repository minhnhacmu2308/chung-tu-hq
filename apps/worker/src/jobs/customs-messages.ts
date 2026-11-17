import { listActiveOrganizationIds, readVnaccsCredentials, type IdentityDeps } from "@kb/core/modules/identity";
import { pullCustomsMessages, type CustomsDeps } from "@kb/core/modules/integration";
import { asOrgId, asUserId, createLogger } from "@kb/core/shared";

const log = createLogger({ name: "worker" });

export type CustomsMessagesDeps = { identity: IdentityDeps; customs: CustomsDeps };
export type CustomsMessagesResult = { orgs: number; applied: number };

/**
 * Job định kỳ (3 giờ): kéo VNACCSREP + áp hộp thư customs_inbox cho mọi doanh nghiệp có tài khoản VNACCS,
 * kể cả khi không còn hồ sơ nào đang customs-poll (thông điệp đến muộn: AMA, chỉ thị sau thông quan; thông điệp PENDING chưa khớp).
 * Doanh nghiệp chưa nhập tài khoản bị bỏ qua (tài khoản chung từ env chỉ dùng dev với fpt-mock). Lỗi ở một doanh nghiệp không chặn doanh nghiệp khác.
 */
export async function customsMessagesJob(deps: CustomsMessagesDeps): Promise<CustomsMessagesResult> {
  const total: CustomsMessagesResult = { orgs: 0, applied: 0 };
  for (const orgId of await listActiveOrganizationIds(deps.identity)) {
    try {
      if (!(await readVnaccsCredentials(deps.identity, orgId))) continue;
      total.orgs++;
      total.applied += await pullCustomsMessages(deps.customs, { orgId: asOrgId(orgId), userId: asUserId("") });
    } catch (e) {
      log.error("lấy thông điệp Hải quan lỗi ở một doanh nghiệp – bỏ qua, tiếp tục", { queue: "customs-messages", orgId, err: e });
    }
  }
  return total;
}
