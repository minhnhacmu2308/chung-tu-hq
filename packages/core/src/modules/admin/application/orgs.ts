// Doanh nghiệp: danh sách, chi tiết, tạo hộ, tạm khóa/mở, đổi loại gói (PAYG ↔ CONTRACT – ADR 0011).
import type { AdminOrg, AdminOrgDetail, AdminReasonInput, ChangeOrgPlanInput, CreateOrgInput, CreateOrgResult, IntegrationStatus } from "@kb/contracts";
import { dec, toDecimalString } from "../../../shared/decimal.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { vnMonth, vnMonthRange } from "../domain/period.js";
import { audit, guarded, orgTarget, toAdminOrg, type StaffActor } from "./_shared.js";
import type { AdminDeps, AdminOrgRow, AdminRepos } from "./ports.js";

const DAY = 86_400_000;

const INTEGRATION_NAMES: Record<string, string> = { HSCODEPRO: "hscodepro", CUSTOMS_HUB: "Customs Hub (VNACCS)", AI_PROVIDER: "Nhà cung cấp AI", EINVOICE: "Tra cứu hóa đơn điện tử" };

/** Ảnh chụp cần để dựng AdminOrg cho mọi doanh nghiệp (một lần đọc). */
export async function orgSnapshot(deps: AdminDeps, r: AdminRepos) {
  const now = deps.clock.now();
  const { from, to } = vnMonthRange(vnMonth(now));
  const [orgs, plans, members, usage, balances, contracts, month, last30] = await Promise.all([
    r.orgs.list(), r.plans.list(), r.members.list(), r.usage.byOrg(from, to), r.credits.balances(), r.contracts.list(), r.credits.statsByOrg(from, to), r.credits.statsByOrg(new Date(now.getTime() - 30 * DAY), now),
  ]);
  const planMap = new Map(plans.map((p) => [p.code, p]));
  const usageMap = new Map(usage.map((u) => [u.orgId, u]));
  const balanceMap = new Map(balances.map((b) => [b.orgId, b.balance]));
  const contractMap = new Map(contracts.map((c) => [c.orgId, c]));
  const monthMap = new Map(month.map((x) => [x.orgId, x.declarations]));
  const last30Map = new Map(last30.map((x) => [x.orgId, x.declarations]));
  const toDto = (o: AdminOrgRow) =>
    toAdminOrg(o, planMap, members, usageMap.get(o.id), { balance: balanceMap.get(o.id) ?? 0, contract: contractMap.get(o.id) ?? null, declarationsThisMonth: monthMap.get(o.id) ?? 0, declarations30d: last30Map.get(o.id) ?? 0 }, now);
  return { orgs, plans, members, usage, toDto };
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
                ...(contract.startsOn ? { startsOn: contract.startsOn } : {}),
                ...(contract.endsOn ? { endsOn: contract.endsOn } : {}),
                valueVnd: toDecimalString(dec(contract.valueVnd), 0),
                ...(contract.note ? { note: contract.note } : {}),
              },
            }
          : {}),
      });
    }),
  );
}

/**
 * Tạo hộ doanh nghiệp + Chủ sở hữu đăng nhập bằng mật khẩu tạm (bắt đổi ở lần đầu). Mật khẩu tạm chỉ trả về một lần trong kết quả này.
 * PAYG: tùy chọn tặng N lượt (ghi cùng transaction tạo doanh nghiệp). CONTRACT: kèm hợp đồng năm (số, bắt đầu, kết thúc, giá trị, ghi chú nội bộ).
 */
export async function createOrg(deps: AdminDeps, actor: StaffActor, input: CreateOrgInput): Promise<Result<CreateOrgResult>> {
  return guarded(actor, "BILLING", async () => {
    const plan = await deps.uow.run((r) => r.plans.get(input.planCode));
    if (!plan) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ"));
    const grant = plan.kind === "PAYG" ? input.grantCredits ?? 0 : 0;
    const created = await deps.identity.provisionOrg({
      taxCode: input.taxCode, name: input.name, address: input.address, planCode: input.planCode, owner: input.owner, ...(grant > 0 ? { grantCredits: grant, createdBy: actor.userId } : {}),
    });
    if (!created.ok) return created;
    const { orgId, tempPassword } = created.value;
    await deps.uow.run(async (r) => {
      const now = deps.clock.now();
      const contract = plan.kind === "CONTRACT" || input.contractNo || input.note;
      if (contract)
        await r.contracts.upsert({
          orgId, contractNo: input.contractNo || null, startsOn: input.startsOn ?? null, endsOn: input.endsOn ?? null, valueVnd: toDecimalString(dec(input.valueVnd ?? "0"), 0),
          note: input.note || null, createdBy: actor.userId, at: now,
        });
      const detail = [
        `Gói ${plan.name}`, grant > 0 ? `tặng ${grant} lượt` : null, input.contractNo ? `HĐ ${input.contractNo}` : null,
        input.startsOn || input.endsOn ? `hiệu lực ${input.startsOn ?? "…"} → ${input.endsOn ?? "…"}` : null, `Chủ sở hữu ${input.owner.email}`,
      ]
        .filter(Boolean)
        .join(" · ");
      await audit(deps, r, actor, "ORG_CREATED", { type: "ORG", id: orgId, label: input.name, orgId, orgName: input.name }, "Tạo hộ doanh nghiệp", detail);
    });
    return ok({ orgId, orgName: input.name, ownerEmail: input.owner.email, tempPassword });
  });
}

/** Khung chung cho thao tác ghi trên một doanh nghiệp: tìm org → `fn` ghi + nhật ký → trả AdminOrg mới. */
export async function mutateOrg(deps: AdminDeps, actor: StaffActor, permission: "SUPPORT" | "BILLING", orgId: string, fn: (r: AdminRepos, o: AdminOrgRow) => Promise<Result<void>>): Promise<Result<AdminOrg>> {
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

/**
 * Đổi loại gói PAYG ↔ CONTRACT. Sổ lượt giữ nguyên (CONTRACT không trừ lượt; chuyển lại PAYG dùng tiếp số dư cũ).
 * Sang CONTRACT mà chưa có hợp đồng → khai không giới hạn tới khi nhập ngày kết thúc (khu Quản trị nhắc CONTRACT_NO_END).
 */
export async function changeOrgPlan(deps: AdminDeps, actor: StaffActor, orgId: string, input: ChangeOrgPlanInput): Promise<Result<AdminOrg>> {
  return mutateOrg(deps, actor, "BILLING", orgId, async (r, o) => {
    if (o.planCode === input.planCode) return err(domainError("CONFLICT", "Doanh nghiệp đang dùng đúng gói này"));
    const [next, before] = await Promise.all([r.plans.get(input.planCode), r.plans.get(o.planCode)]);
    if (!next) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ"));
    const now = deps.clock.now();
    await r.orgs.update(o.id, { planCode: next.code, planStartedAt: now }, now);
    await audit(deps, r, actor, "ORG_PLAN_CHANGED", orgTarget(o), input.reason, `${before?.name ?? o.planCode} → ${next.name}`);
    return ok(undefined);
  });
}
