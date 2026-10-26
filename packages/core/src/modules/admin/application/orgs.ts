// Doanh nghiệp: danh sách, chi tiết, tạm khóa/mở, đổi gói, nới hạn mức, gia hạn dùng thử.
import type { AdjustOrgQuotaInput, AdminOrg, AdminOrgDetail, AdminReasonInput, ChangeOrgPlanInput, CreateOrgInput, CreateOrgResult, ExtendOrgTrialInput, IntegrationStatus } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { extendTrial, renewsAt, vnMonth, vnMonthRange } from "../domain/period.js";
import { audit, guarded, orgTarget, toAdminOrg, type StaffActor } from "./_shared.js";
import type { AdminDeps, AdminOrgRow, AdminRepos } from "./ports.js";

const INTEGRATION_NAMES: Record<string, string> = { HSCODEPRO: "hscodepro", CUSTOMS_HUB: "Customs Hub (VNACCS)", AI_PROVIDER: "Nhà cung cấp AI", EINVOICE: "Tra cứu hóa đơn điện tử" };

/** Ảnh chụp cần để dựng AdminOrg cho mọi doanh nghiệp (một lần đọc). */
export async function orgSnapshot(deps: AdminDeps, r: AdminRepos) {
  const now = deps.clock.now();
  const { from, to } = vnMonthRange(vnMonth(now));
  const [orgs, plans, members, usage] = await Promise.all([r.orgs.list(), r.plans.list(), r.members.list(), r.usage.byOrg(from, to)]);
  const planMap = new Map(plans.map((p) => [p.code, p]));
  const usageMap = new Map(usage.map((u) => [u.orgId, u]));
  return { orgs, plans, members, usage, toDto: (o: AdminOrgRow) => toAdminOrg(o, planMap, members, usageMap.get(o.id), now) };
}

export async function listOrgs(deps: AdminDeps, actor: StaffActor): Promise<Result<AdminOrg[]>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => {
      const snap = await orgSnapshot(deps, r);
      return ok(snap.orgs.map(snap.toDto).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }),
  );
}

export async function getOrg(deps: AdminDeps, actor: StaffActor, orgId: string): Promise<Result<AdminOrgDetail>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => {
      const snap = await orgSnapshot(deps, r);
      const o = snap.orgs.find((x) => x.id === orgId);
      if (!o) return err(domainError("NOT_FOUND", "Không tìm thấy doanh nghiệp"));
      const [integrations, certificates, contract] = await Promise.all([r.orgConnections.integrations(orgId), r.orgConnections.certificates(orgId), r.contracts.get(orgId)]);
      return ok({
        ...snap.toDto(o),
        address: o.address,
        phone: o.phone,
        // Chỉ trạng thái kết nối – không có khóa, không có nội dung thông điệp.
        integrations: integrations.map((i) => ({ id: i.id, name: INTEGRATION_NAMES[i.id] ?? i.id, status: (["CONNECTED", "ERROR"].includes(i.status) ? i.status : "NOT_CONFIGURED") as IntegrationStatus })),
        certificates,
        ...(contract
          ? {
              contract: {
                ...(contract.contractNo ? { contractNo: contract.contractNo } : {}),
                ...(contract.endsOn ? { endsOn: contract.endsOn } : {}),
                ...(contract.note ? { note: contract.note } : {}),
              },
            }
          : {}),
      });
    }),
  );
}

/**
 * Tạo hộ doanh nghiệp ký hợp đồng trực tiếp: doanh nghiệp (gói chọn sẵn) + Chủ sở hữu đăng nhập bằng mật khẩu tạm (bắt đổi ở lần đầu)
 * + hợp đồng (số, hạn, ghi chú nội bộ). Mật khẩu tạm chỉ trả về một lần trong kết quả này.
 */
export async function createOrg(deps: AdminDeps, actor: StaffActor, input: CreateOrgInput): Promise<Result<CreateOrgResult>> {
  return guarded(actor, "BILLING", async () => {
    const plan = await deps.uow.run((r) => r.plans.get(input.planCode));
    if (!plan) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ"));
    const created = await deps.identity.provisionOrg({ taxCode: input.taxCode, name: input.name, address: input.address, planCode: input.planCode, owner: input.owner });
    if (!created.ok) return created;
    const { orgId, tempPassword } = created.value;
    await deps.uow.run(async (r) => {
      const now = deps.clock.now();
      await r.contracts.insert({ orgId, contractNo: input.contractNo || null, endsOn: input.contractEndsOn ?? null, note: input.note || null, createdBy: actor.userId, at: now });
      const detail = [`Gói ${plan.name}`, input.contractNo ? `HĐ ${input.contractNo}` : null, input.contractEndsOn ? `hết hạn ${input.contractEndsOn}` : null, `Chủ sở hữu ${input.owner.email}`]
        .filter(Boolean)
        .join(" · ");
      await audit(deps, r, actor, "ORG_CREATED", { type: "ORG", id: orgId, label: input.name, orgId, orgName: input.name }, "Tạo doanh nghiệp ký hợp đồng trực tiếp", detail);
    });
    return ok({ orgId, orgName: input.name, ownerEmail: input.owner.email, tempPassword });
  });
}

/** Khung chung cho thao tác ghi trên một doanh nghiệp: tìm org → `fn` ghi + nhật ký → trả AdminOrg mới. */
async function mutateOrg(deps: AdminDeps, actor: StaffActor, permission: "SUPPORT" | "BILLING", orgId: string, fn: (r: AdminRepos, o: AdminOrgRow) => Promise<Result<void>>): Promise<Result<AdminOrg>> {
  return guarded(actor, permission, () =>
    deps.uow.run(async (r) => {
      const o = await r.orgs.get(orgId);
      if (!o) return err(domainError("NOT_FOUND", "Không tìm thấy doanh nghiệp"));
      const done = await fn(r, o);
      if (!done.ok) return done;
      const snap = await orgSnapshot(deps, r);
      return ok(snap.toDto((await r.orgs.get(orgId))!));
    }),
  );
}

/** Tạm khóa: thành viên không đăng nhập được, phiên đang mở hết hiệu lực ngay (get-session của identity kiểm trạng thái org). */
export async function suspendOrg(deps: AdminDeps, actor: StaffActor, orgId: string, input: AdminReasonInput): Promise<Result<AdminOrg>> {
  return mutateOrg(deps, actor, "SUPPORT", orgId, async (r, o) => {
    if (o.status === "SUSPENDED") return err(domainError("CONFLICT", "Doanh nghiệp này đang bị tạm khóa"));
    await r.orgs.update(o.id, { status: "SUSPENDED", suspendedReason: input.reason }, deps.clock.now());
    await audit(deps, r, actor, "ORG_SUSPENDED", orgTarget(o), input.reason);
    return ok(undefined);
  });
}

export async function reactivateOrg(deps: AdminDeps, actor: StaffActor, orgId: string, input: AdminReasonInput): Promise<Result<AdminOrg>> {
  return mutateOrg(deps, actor, "SUPPORT", orgId, async (r, o) => {
    if (o.status === "ACTIVE") return err(domainError("CONFLICT", "Doanh nghiệp này đang hoạt động"));
    await r.orgs.update(o.id, { status: "ACTIVE", suspendedReason: null }, deps.clock.now());
    await audit(deps, r, actor, "ORG_REACTIVATED", orgTarget(o), input.reason);
    return ok(undefined);
  });
}

/** Đổi gói: bắt đầu kỳ 30 ngày mới từ hôm nay; bỏ hạn dùng thử đã gia hạn tay. */
export async function changeOrgPlan(deps: AdminDeps, actor: StaffActor, orgId: string, input: ChangeOrgPlanInput): Promise<Result<AdminOrg>> {
  return mutateOrg(deps, actor, "BILLING", orgId, async (r, o) => {
    if (o.planCode === input.planCode) return err(domainError("CONFLICT", "Doanh nghiệp đang dùng đúng gói này"));
    const [next, before] = await Promise.all([r.plans.get(input.planCode), r.plans.get(o.planCode)]);
    if (!next) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ"));
    const now = deps.clock.now();
    await r.orgs.update(o.id, { planCode: next.code, planStartedAt: now, trialEndsAt: null }, now);
    await audit(deps, r, actor, "ORG_PLAN_CHANGED", orgTarget(o), input.reason, `${before?.name ?? o.planCode} → ${next.name}`);
    return ok(undefined);
  });
}

/** Nới hạn mức cho tháng hiện tại (giờ VN); sang tháng sau tự hết. 0 = bỏ phần nới. */
export async function adjustOrgQuota(deps: AdminDeps, actor: StaffActor, orgId: string, input: AdjustOrgQuotaInput): Promise<Result<AdminOrg>> {
  return mutateOrg(deps, actor, "BILLING", orgId, async (r, o) => {
    const now = deps.clock.now();
    await r.orgs.update(o.id, { quotaBonus: input.bonusDossiers, quotaBonusMonth: input.bonusDossiers > 0 ? vnMonth(now) : null }, now);
    await audit(deps, r, actor, "ORG_QUOTA_ADJUSTED", orgTarget(o), input.reason, input.bonusDossiers > 0 ? `+${input.bonusDossiers} hồ sơ tháng này` : "Bỏ phần nới hạn mức");
    return ok(undefined);
  });
}

export async function extendOrgTrial(deps: AdminDeps, actor: StaffActor, orgId: string, input: ExtendOrgTrialInput): Promise<Result<AdminOrg>> {
  return mutateOrg(deps, actor, "BILLING", orgId, async (r, o) => {
    if (o.planCode !== "TRIAL") return err(domainError("CONFLICT", "Chỉ gia hạn được cho doanh nghiệp đang dùng thử"));
    const now = deps.clock.now();
    await r.orgs.update(o.id, { trialEndsAt: extendTrial(renewsAt(o, now), now, input.days) }, now);
    await audit(deps, r, actor, "ORG_TRIAL_EXTENDED", orgTarget(o), input.reason, `+${input.days} ngày dùng thử`);
    return ok(undefined);
  });
}
