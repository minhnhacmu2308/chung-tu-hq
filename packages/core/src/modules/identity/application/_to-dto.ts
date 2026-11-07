import type { Member, Organization } from "@kb/contracts";
import { dec, toDecimalString } from "../../../shared/decimal.js";
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

/** Lượt mặc định khi billing chưa nối (test/cấu hình cũ). */
export const EMPTY_BILLING: Organization["billing"] = { balance: 0, reserved: 0, available: 0, contract: null, declarationsThisMonth: 0 };

/** `billing`/`usage` do module billing cung cấp (container nối); không có → 0. */
export function toOrganization(o: OrgRow, plan: PlanRow | null, billing?: Organization["billing"], usage?: Organization["usage"]): Organization {
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
      kind: plan?.kind ?? (o.planCode === "CONTRACT" ? "CONTRACT" : "PAYG"),
      pagesPerDossier: plan?.pagesPerDossier ?? 0,
      pricePerDeclarationVnd: plan ? toDecimalString(dec(plan.pricePerDeclarationVnd), 0) : "0",
    },
    billing: billing ?? EMPTY_BILLING,
    usage: usage ?? { dossiersThisMonth: 0, pagesThisMonth: 0 },
    suspectThreshold: o.suspectThreshold as Organization["suspectThreshold"],
    fourEyes: o.fourEyes,
  };
}
