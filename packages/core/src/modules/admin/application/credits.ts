// Lượt và hợp đồng của một doanh nghiệp (khu Quản trị, ADR 0011): sổ lượt, điều chỉnh lượt tay, hợp đồng năm. Mọi lệnh ghi đều vào nhật ký quản trị.
import type { AdjustOrgCreditsInput, AdminOrg, AdminOrgCredits, UpsertOrgContractInput } from "@kb/contracts";
import { toLedgerEntry, toPayment } from "../../billing/index.js";
import { dec, toDecimalString } from "../../../shared/decimal.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { audit, guarded, orgTarget, type StaffActor } from "./_shared.js";
import { mutateOrg } from "./orgs.js";
import type { AdminDeps } from "./ports.js";

export const ADMIN_LEDGER_PAGE = 100;
const ADMIN_PAYMENTS_PAGE = 50;

const KIND_LABEL: Record<AdjustOrgCreditsInput["kind"], string> = { MANUAL_TOPUP: "Nạp tay", GRANT: "Tặng", REFUND: "Hoàn", ADJUST: "Điều chỉnh" };

/** GET /api/admin/orgs/[id]/credits: số dư, 100 dòng sổ lượt gần nhất, thanh toán gần đây. */
export async function listOrgCredits(deps: AdminDeps, actor: StaffActor, orgId: string): Promise<Result<AdminOrgCredits>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => {
      if (!(await r.orgs.get(orgId))) return err(domainError("NOT_FOUND", "Không tìm thấy doanh nghiệp"));
      const [ledger, payments, balance] = await Promise.all([r.credits.list(orgId, ADMIN_LEDGER_PAGE), r.payments.list(orgId, ADMIN_PAYMENTS_PAGE), r.credits.balance(orgId)]);
      return ok({ balance, ledger: ledger.map(toLedgerEntry), payments: payments.map(toPayment) });
    }),
  );
}

/**
 * Nạp/tặng/hoàn/điều chỉnh lượt (chuyển khoản ngoài, khuyến mãi, hoàn tiền…). Ghi một dòng sổ lượt (append-only) + nhật ký quản trị trong
 * CÙNG transaction. `note` hiện cho khách trong lịch sử lượt; `reason` chỉ trong nhật ký quản trị.
 * `idempotencyKey` (hộp thoại sinh một khóa mỗi lần mở): bấm hai lần / gửi lại cùng khóa → không ghi dòng thứ hai, không ghi nhật ký lần nữa.
 */
export async function adjustOrgCredits(deps: AdminDeps, actor: StaffActor, orgId: string, input: AdjustOrgCreditsInput): Promise<Result<AdminOrg>> {
  return mutateOrg(deps, actor, "BILLING", orgId, async (r, o) => {
    if (input.delta === 0) return err(domainError("VALIDATION", "Nhập số lượt khác 0"));
    if ((input.kind === "MANUAL_TOPUP" || input.kind === "GRANT") && input.delta < 0) return err(domainError("VALIDATION", "Nạp/tặng lượt phải là số dương"));
    const now = deps.clock.now();
    const amount = toDecimalString(dec(input.amountVnd ?? "0"), 0);
    const inserted = await r.credits.insert({
      id: input.idempotencyKey ? `adj:${o.id}:${input.idempotencyKey}` : deps.idGen.next("crd"), orgId: o.id, delta: input.delta, reason: input.kind, amountVnd: amount, unitPriceVnd: toDecimalString(dec(amount).div(Math.abs(input.delta)), 0),
      dossierId: null, branch: null, declarationNo: null, paymentId: null, note: input.note, createdBy: actor.userId, at: now,
    });
    if (inserted) await audit(deps, r, actor, "ORG_CREDITS_ADJUSTED", orgTarget(o), input.reason, `${KIND_LABEL[input.kind]} ${input.delta > 0 ? "+" : ""}${input.delta} lượt · ${input.note}`);
    return ok(undefined);
  });
}

/** PUT /api/admin/orgs/[id]/contract: tạo/sửa hợp đồng năm. Chỉ doanh nghiệp gói CONTRACT. */
export async function upsertOrgContract(deps: AdminDeps, actor: StaffActor, orgId: string, input: UpsertOrgContractInput): Promise<Result<AdminOrg>> {
  return mutateOrg(deps, actor, "BILLING", orgId, async (r, o) => {
    const plan = await r.plans.get(o.planCode);
    if (plan?.kind !== "CONTRACT") return err(domainError("INVALID_STATE", "Chỉ doanh nghiệp gói Hợp đồng năm mới có hợp đồng – đổi loại gói trước"));
    if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) return err(domainError("VALIDATION", "Ngày kết thúc phải sau ngày bắt đầu"));
    const before = await r.contracts.get(o.id);
    const value = toDecimalString(dec(input.valueVnd), 0);
    const now = deps.clock.now();
    await r.contracts.upsert({
      orgId: o.id, contractNo: input.contractNo || null, startsOn: input.startsOn ?? null, endsOn: input.endsOn ?? null, valueVnd: value, note: input.note || null,
      createdBy: before?.createdBy ?? actor.userId, at: now,
    });
    const detail = [input.contractNo ? `HĐ ${input.contractNo}` : null, `hiệu lực ${input.startsOn ?? "…"} → ${input.endsOn ?? "…"}`, `giá trị ${value} VND`].filter(Boolean).join(" · ");
    await audit(deps, r, actor, "ORG_CONTRACT_UPDATED", orgTarget(o), input.reason, before ? `Sửa: ${detail}` : `Tạo: ${detail}`);
    return ok(undefined);
  });
}
