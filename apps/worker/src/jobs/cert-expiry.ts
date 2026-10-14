import { notifyExpiringCertificates, type IdentityDeps } from "@kb/core/modules/identity";

/** Hằng ngày: chứng thư số sắp hết hạn → thông báo OWNER/ADMIN. */
export async function certExpiryJob(deps: IdentityDeps) {
  const r = await notifyExpiringCertificates(deps);
  return r.ok ? `notified=${r.value.notified}` : r.error.code;
}
