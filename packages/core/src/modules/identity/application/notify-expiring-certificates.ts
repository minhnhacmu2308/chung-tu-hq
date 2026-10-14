// Job hằng ngày: chứng thư số sắp hết hạn (≤ 30 ngày) → thông báo OWNER/ADMIN của từng org. Idempotent theo ngày (không gửi lại trong ngày).
import { ok, type Result } from "../../../shared/result.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { IdentityDeps } from "./ports.js";

export const CERT_EXPIRY_DAYS = 30;

export async function notifyExpiringCertificates(deps: IdentityDeps, opts: { daysAhead?: number } = {}): Promise<Result<{ notified: number }>> {
  const now = deps.clock.now();
  const horizon = opts.daysAhead ?? CERT_EXPIRY_DAYS;
  const today = now.toISOString().slice(0, 10);
  const orgs = await deps.uow.system((r) => r.orgs.listAll());
  let notified = 0;
  for (const org of orgs) {
    const ctx = { orgId: asOrgId(org.id), userId: asUserId("") };
    notified += await deps.uow.asOrg(ctx, async (r) => {
      const expiring = (await r.certificates.list(org.id)).filter((c) => {
        const days = (new Date(c.validTo).getTime() - now.getTime()) / 86_400_000;
        return days >= 0 && days <= horizon;
      });
      if (!expiring.length) return 0;
      const managers = (await r.memberships.listByOrg(org.id)).filter((m) => m.status === "ACTIVE" && (m.role === "OWNER" || m.role === "ADMIN"));
      let n = 0;
      for (const c of expiring) {
        const title = `Chứng thư số ${c.issuer} hết hạn ${c.validTo}`;
        for (const m of managers) {
          // RLS notifications chỉ lộ thông báo của chính người dùng → đọc trong ngữ cảnh của người nhận (ngữ cảnh job có userId rỗng không thấy gì).
          const mine = await deps.uow.asOrg({ orgId: asOrgId(org.id), userId: asUserId(m.userId) }, (u) => u.notifications.list(org.id, m.userId));
          const dup = mine.some((x) => x.title === title && x.createdAt.toISOString().slice(0, 10) === today);
          if (dup) continue;
          await r.notifications.insert({ id: deps.idGen.next("ntf"), orgId: org.id, userId: m.userId, title, body: "Gia hạn hoặc thêm chứng thư mới ở Tài khoản & tích hợp → Chứng thư số để không gián đoạn truyền tờ khai.", href: "/settings?tab=certificates", readAt: null, createdAt: now });
          n++;
        }
      }
      return n;
    });
  }
  return ok({ notified });
}
