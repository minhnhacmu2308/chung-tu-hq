import type { IdentityDeps } from "./ports.js";

/** Mã mọi doanh nghiệp đang hoạt động – cho job định kỳ chạy theo từng org (ngữ cảnh hệ thống, không có org). */
export async function listActiveOrganizationIds(deps: IdentityDeps): Promise<string[]> {
  const orgs = await deps.uow.system((r) => r.orgs.listAll());
  return orgs.filter((o) => o.status !== "SUSPENDED").map((o) => o.id);
}
