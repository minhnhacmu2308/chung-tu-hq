// Gói dịch vụ (PAYG / CONTRACT – ADR 0011) và báo cáo sử dụng & chi phí (giá vốn từ usage_events, doanh thu từ sổ lượt / hợp đồng; tiền bằng Decimal).
import type { AdminPlan, OrgUsageRow, PlanCode, UpdatePlanInput, UsageReport } from "@kb/contracts";
import { contractCoversMonth } from "../../billing/index.js";
import { dec, sumDec, toDecimalString } from "../../../shared/decimal.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { recentMonths, vnMonth, vnMonthRange } from "../domain/period.js";
import { audit, guarded, sumMoney, type StaffActor } from "./_shared.js";
import type { AdminDeps, PlanRow } from "./ports.js";

const money = (v: string) => toDecimalString(dec(v), 0);
const toPlan = (p: PlanRow, orgCount: number): AdminPlan => ({
  code: p.code as PlanCode, name: p.name, kind: p.kind, pagesPerDossier: p.pagesPerDossier, priceVnd: money(p.priceVnd), pricePerDeclarationVnd: money(p.pricePerDeclarationVnd), orgCount,
});

export async function listPlans(deps: AdminDeps, actor: StaffActor): Promise<Result<AdminPlan[]>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => {
      const [plans, orgs] = await Promise.all([r.plans.list(), r.orgs.list()]);
      return ok(plans.map((p) => toPlan(p, orgs.filter((o) => o.planCode === p.code).length)));
    }),
  );
}

/**
 * Sửa gói: doanh nghiệp đang dùng gói nhận số trang/đơn giá mới ngay (đọc từ bảng plans). Lượt đã trừ giữ đơn giá lúc trừ (sổ lượt).
 * CONTRACT không có đơn giá lượt (luôn 0).
 */
export async function updatePlan(deps: AdminDeps, actor: StaffActor, code: string, input: UpdatePlanInput): Promise<Result<AdminPlan>> {
  return guarded(actor, "BILLING", () =>
    deps.uow.run(async (r) => {
      const p = await r.plans.get(code);
      if (!p) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ"));
      const price = money(input.priceVnd);
      const perDeclaration = p.kind === "PAYG" ? money(input.pricePerDeclarationVnd) : "0";
      if (p.kind === "PAYG" && dec(perDeclaration).lte(0)) return err(domainError("VALIDATION", "Đơn giá một lượt phải lớn hơn 0"));
      const changes = [
        p.name !== input.name && `Tên ${p.name} → ${input.name}`,
        p.pagesPerDossier !== input.pagesPerDossier && `Trang/hồ sơ ${p.pagesPerDossier} → ${input.pagesPerDossier}`,
        !dec(p.priceVnd).eq(dec(price)) && `Giá niêm yết ${money(p.priceVnd)} → ${price} VND`,
        !dec(p.pricePerDeclarationVnd).eq(dec(perDeclaration)) && `Đơn giá/lượt ${money(p.pricePerDeclarationVnd)} → ${perDeclaration} VND`,
      ].filter((x): x is string => Boolean(x));
      if (changes.length === 0) return err(domainError("CONFLICT", "Chưa có thay đổi nào"));
      const next = { name: input.name, pagesPerDossier: input.pagesPerDossier, priceVnd: price, pricePerDeclarationVnd: perDeclaration };
      await r.plans.update(code, next, deps.clock.now());
      await audit(deps, r, actor, "PLAN_UPDATED", { type: "PLAN", id: code, label: `Gói ${input.name}` }, input.reason, changes.join(" · "));
      const orgs = await r.orgs.list();
      return ok(toPlan({ code, kind: p.kind, ...next }, orgs.filter((o) => o.planCode === code).length));
    }),
  );
}

/** 6 tháng gần nhất (giờ VN), mới nhất đứng đầu. */
export async function listUsageMonths(deps: AdminDeps, actor: StaffActor): Promise<Result<string[]>> {
  return guarded(actor, "VIEW", async () => ok(recentMonths(deps.clock.now())));
}

/**
 * Báo cáo một tháng: mỗi doanh nghiệp đã đăng ký trước cuối tháng. Giá vốn tách theo nhà cung cấp (AI đọc chứng từ, HSCodePro, Customs Hub).
 * Doanh thu ghi nhận: PAYG = tổng tiền các lượt đã trừ (CHARGE, đơn giá lúc trừ) trong tháng; CONTRACT = giá trị hợp đồng / 12 nếu hợp đồng phủ tháng đó.
 * Tiền thu PayOS (PURCHASE) báo riêng – là tiền mặt, không phải doanh thu. Lãi gộp = doanh thu ghi nhận − giá vốn, âm là đang lỗ.
 * Doanh nghiệp được xếp theo loại gói hiện tại (chưa lưu lịch sử đổi gói).
 */
export async function getUsageReport(deps: AdminDeps, actor: StaffActor, month: string): Promise<Result<UsageReport>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => {
      if (!recentMonths(deps.clock.now(), 24).includes(month)) return err(domainError("NOT_FOUND", "Chưa có số liệu cho tháng này"));
      const { from, to } = vnMonthRange(month);
      const [orgs, plans, usage, credits, contracts] = await Promise.all([r.orgs.list(), r.plans.list(), r.usage.byOrg(from, to), r.credits.statsByOrg(from, to), r.contracts.list()]);
      const planMap = new Map(plans.map((p) => [p.code, p]));
      const usageMap = new Map(usage.map((u) => [u.orgId, u]));
      const creditMap = new Map(credits.map((c) => [c.orgId, c]));
      const contractMap = new Map(contracts.map((c) => [c.orgId, c]));
      const rows = orgs
        .filter((o) => vnMonth(o.createdAt) <= month)
        .map((o): OrgUsageRow => {
          const u = usageMap.get(o.id);
          const c = creditMap.get(o.id);
          const plan = planMap.get(o.planCode);
          const kind = plan?.kind ?? (o.planCode === "CONTRACT" ? "CONTRACT" : "PAYG");
          const read = money(u?.readCostVnd ?? "0");
          const hs = money(u?.hsCostVnd ?? "0");
          const customs = money(u?.customsCostVnd ?? "0");
          const total = sumMoney([read, hs, customs]);
          const contract = contractMap.get(o.id);
          const revenue =
            kind === "CONTRACT"
              ? contract && contractCoversMonth(contract, month) ? toDecimalString(dec(contract.valueVnd).div(12), 0) : "0"
              : money(c?.chargedVnd ?? "0");
          return {
            orgId: o.id, orgName: o.name, planCode: o.planCode as OrgUsageRow["planCode"], planName: plan?.name ?? o.planCode, planKind: kind,
            dossiers: u?.dossiers ?? 0, pages: u?.pages ?? 0, aiCalls: u?.aiCalls ?? 0, hsItems: u?.hsItems ?? 0, customsMessages: u?.customsMessages ?? 0,
            readCostVnd: read, hsCostVnd: hs, customsCostVnd: customs, totalCostVnd: total,
            declarations: c?.declarations ?? 0, revenueVnd: revenue, collectedVnd: money(c?.collectedVnd ?? "0"),
            marginVnd: toDecimalString(dec(revenue).minus(dec(total)), 0),
          };
        })
        .sort((a, b) => dec(b.totalCostVnd).cmp(dec(a.totalCostVnd)));
      const cost = sumDec(rows.map((x) => x.totalCostVnd));
      const revenue = sumDec(rows.map((x) => x.revenueVnd));
      return ok({
        month,
        rows,
        totals: {
          dossiers: rows.reduce((n, x) => n + x.dossiers, 0),
          pages: rows.reduce((n, x) => n + x.pages, 0),
          aiCalls: rows.reduce((n, x) => n + x.aiCalls, 0),
          hsItems: rows.reduce((n, x) => n + x.hsItems, 0),
          customsMessages: rows.reduce((n, x) => n + x.customsMessages, 0),
          readCostVnd: sumMoney(rows.map((x) => x.readCostVnd)),
          hsCostVnd: sumMoney(rows.map((x) => x.hsCostVnd)),
          customsCostVnd: sumMoney(rows.map((x) => x.customsCostVnd)),
          totalCostVnd: toDecimalString(cost, 0),
          declarations: rows.reduce((n, x) => n + x.declarations, 0),
          revenueVnd: toDecimalString(revenue, 0),
          collectedVnd: sumMoney(rows.map((x) => x.collectedVnd)),
          marginVnd: toDecimalString(revenue.minus(cost), 0),
        },
      });
    }),
  );
}
