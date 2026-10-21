import type { Member, Organization } from "@kb/contracts";
import type { MembershipRow, OrgRow, PlanRow, UserRow } from "./ports.js";

export function toMember(u: UserRow, m: MembershipRow, lastSeen?: Date): Member {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: m.role,
    status: m.status,
    ...(lastSeen ? { lastActiveAt: lastSeen.toISOString() } : {}),
  };
}

/**
 * `usage` do billing cung cấp (container nối); không có → 0.
 * renewsAt = mốc (lần đổi gói gần nhất, hoặc ngày tạo) + bội số 30 ngày tiếp theo; dùng thử được gia hạn tay → đúng ngày hết hạn đó.
 * Cùng công thức với `renewsAt` của module admin (domain/period.ts).
 */
export function toOrganization(o: OrgRow, plan: PlanRow | null, now: Date, usage?: Organization["usage"]): Organization {
  const DAY = 86_400_000;
  const anchor = o.planStartedAt ?? o.createdAt;
  const elapsed = Math.max(0, now.getTime() - anchor.getTime());
  const renews = o.planCode === "TRIAL" && o.trialEndsAt ? o.trialEndsAt : new Date(anchor.getTime() + (Math.floor(elapsed / (30 * DAY)) + 1) * 30 * DAY);
  return {
    id: o.id,
    name: o.name,
    taxCode: o.taxCode,
    address: o.address,
    phone: o.phone,
    postalCode: o.postalCode ?? "",
    plan: {
      code: (plan?.code ?? o.planCode) as Organization["plan"]["code"],
      name: plan?.name ?? o.planCode,
      dossiersPerMonth: plan?.dossiersPerMonth ?? 0,
      pagesPerDossier: plan?.pagesPerDossier ?? 0,
      renewsAt: renews.toISOString().slice(0, 10),
    },
    usage: usage ?? { dossiersThisMonth: 0, pagesThisMonth: 0, aiCostVnd: "0" },
    suspectThreshold: o.suspectThreshold as Organization["suspectThreshold"],
    fourEyes: o.fourEyes,
  };
}
