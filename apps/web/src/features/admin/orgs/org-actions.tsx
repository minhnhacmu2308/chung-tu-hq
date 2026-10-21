"use client";
// Các thao tác trên một doanh nghiệp (khóa/mở, đổi gói, nới hạn mức, gia hạn dùng thử). Dùng ở cả danh sách lẫn trang chi tiết.
import { AdjustOrgQuotaInputSchema, ExtendOrgTrialInputSchema, type AdminOrg, type PlanCode } from "@kb/contracts";
import { Alert, Field, fill, Input, Select, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Gauge, Lock, LockOpen, Repeat } from "lucide-react";
import { useEffect, useState } from "react";
import { adjustOrgQuota, adminKeys, changeOrgPlan, extendOrgTrial, listAdminPlans, reactivateOrg, suspendOrg } from "@/api/admin";
import { formatDate, formatNumber } from "@/lib/format";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { ORG_ACTIONS_MESSAGES } from "./orgs.messages";

export type OrgAction = "suspend" | "reactivate" | "plan" | "quota" | "trial";

type Props = { org: Pick<AdminOrg, "id" | "name" | "plan" | "quotaBonus" | "usage">; action: OrgAction | null; onClose: () => void };

/** Số nguyên từ ô nhập; rỗng hoặc không phải số → NaN để schema báo lỗi. */
const toInt = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

/** Thông báo của schema (@kb/contracts) chỉ có tiếng Việt → hiển thị theo mã lỗi. */
const issueText = (code: string | undefined, m: { int: string; min: string; max: string }) =>
  code === "too_small" ? m.min : code === "too_big" ? m.max : m.int;

export function OrgActionDialogs({ org, action, onClose }: Props) {
  const t = useMessages(ORG_ACTIONS_MESSAGES);
  const plans = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans, enabled: action === "plan" });
  const [planCode, setPlanCode] = useState<PlanCode | "">("");
  const [bonus, setBonus] = useState("");
  const [days, setDays] = useState("14");
  useEffect(() => {
    if (action === "plan") setPlanCode("");
    if (action === "quota") setBonus(String(org.quotaBonus));
    if (action === "trial") setDays("14");
  }, [action, org.quotaBonus]);

  const onOpenChange = (open: boolean) => !open && onClose();
  const done = { onSuccess: onClose };
  const suspend = useAdminMutation({ mutationFn: (reason: string) => suspendOrg(org.id, { reason }), success: () => fill(t.suspendedToast, { name: org.name }), errorTitle: t.suspendError, ...done });
  const reactivate = useAdminMutation({ mutationFn: (reason: string) => reactivateOrg(org.id, { reason }), success: () => fill(t.reactivatedToast, { name: org.name }), errorTitle: t.reactivateError, ...done });
  const plan = useAdminMutation({
    mutationFn: (v: { planCode: PlanCode; reason: string }) => changeOrgPlan(org.id, v),
    success: (o) => fill(t.planToast, { plan: o.plan.name }),
    errorTitle: t.planError,
    ...done,
  });
  const quota = useAdminMutation({
    mutationFn: (v: { bonusDossiers: number; reason: string }) => adjustOrgQuota(org.id, v),
    success: (o) => (o.quotaBonus > 0 ? fill(t.quotaToast, { n: formatNumber(o.quotaBonus) }) : t.quotaRemovedToast),
    errorTitle: t.quotaError,
    ...done,
  });
  const trial = useAdminMutation({
    mutationFn: (v: { days: number; reason: string }) => extendOrgTrial(org.id, v),
    success: (o) => fill(t.trialToast, { date: formatDate(o.plan.renewsAt) }),
    errorTitle: t.trialError,
    ...done,
  });

  const bonusCheck = AdjustOrgQuotaInputSchema.shape.bonusDossiers.safeParse(toInt(bonus));
  const daysCheck = ExtendOrgTrialInputSchema.shape.days.safeParse(toInt(days));
  const nextPlan = plans.data?.find((p) => p.code === planCode);

  return (
    <>
      <ReasonDialog
        open={action === "suspend"}
        onOpenChange={onOpenChange}
        title={t.suspendTitle}
        icon={<Lock className="h-4 w-4" />}
        description={org.name}
        confirmLabel={t.suspendConfirm}
        tone="danger"
        pending={suspend.isPending}
        reasonHint={t.suspendHint}
        onConfirm={(reason) => suspend.mutate(reason)}
      >
        <Alert tone="warning">{t.suspendWarning}</Alert>
      </ReasonDialog>

      <ReasonDialog
        open={action === "reactivate"}
        onOpenChange={onOpenChange}
        title={t.reactivateTitle}
        icon={<LockOpen className="h-4 w-4" />}
        description={org.name}
        confirmLabel={t.reactivateConfirm}
        pending={reactivate.isPending}
        onConfirm={(reason) => reactivate.mutate(reason)}
      />

      <ReasonDialog
        open={action === "plan"}
        onOpenChange={onOpenChange}
        title={t.planTitle}
        icon={<Repeat className="h-4 w-4" />}
        description={fill(t.planDescription, { name: org.name, plan: org.plan.name })}
        confirmLabel={t.planConfirm}
        pending={plan.isPending}
        canSubmit={planCode !== ""}
        onConfirm={(reason) => planCode !== "" && plan.mutate({ planCode, reason })}
      >
        <Field label={t.newPlan} required hint={nextPlan ? fill(t.newPlanHint, { dossiers: formatNumber(nextPlan.dossiersPerMonth), pages: nextPlan.pagesPerDossier }) : t.newPlanHintEmpty}>
          <Select
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value as PlanCode | "")}
            placeholder={plans.isLoading ? t.loadingPlans : t.choosePlan}
            options={(plans.data ?? []).filter((p) => p.code !== org.plan.code).map((p) => ({ value: p.code, label: p.name }))}
          />
        </Field>
        {nextPlan && org.usage.dossiersThisMonth > nextPlan.dossiersPerMonth && (
          <Alert tone="warning">
            {fill(t.overNewPlan, { used: formatNumber(org.usage.dossiersThisMonth), limit: formatNumber(nextPlan.dossiersPerMonth), plan: nextPlan.name })}
          </Alert>
        )}
      </ReasonDialog>

      <ReasonDialog
        open={action === "quota"}
        onOpenChange={onOpenChange}
        title={t.quotaTitle}
        icon={<Gauge className="h-4 w-4" />}
        description={fill(t.quotaDescription, { name: org.name, plan: org.plan.name, dossiers: formatNumber(org.plan.dossiersPerMonth) })}
        confirmLabel={t.quotaConfirm}
        pending={quota.isPending}
        canSubmit={bonusCheck.success}
        onConfirm={(reason) => bonusCheck.success && quota.mutate({ bonusDossiers: bonusCheck.data, reason })}
      >
        <Field
          label={t.bonusLabel}
          required
          className="cq-md:max-w-xs"
          hint={t.bonusHint}
          {...(bonus !== "" && !bonusCheck.success ? { error: issueText(bonusCheck.error.issues[0]?.code, { int: t.bonusInt, min: t.bonusMin, max: t.bonusMax }) } : {})}
        >
          <Input inputMode="numeric" value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </Field>
      </ReasonDialog>

      <ReasonDialog
        open={action === "trial"}
        onOpenChange={onOpenChange}
        title={t.trialTitle}
        icon={<CalendarPlus className="h-4 w-4" />}
        description={fill(t.trialDescription, { name: org.name, date: formatDate(org.plan.renewsAt) })}
        confirmLabel={t.trialConfirm}
        pending={trial.isPending}
        canSubmit={daysCheck.success}
        onConfirm={(reason) => daysCheck.success && trial.mutate({ days: daysCheck.data, reason })}
      >
        <Field label={t.daysLabel} required className="cq-md:max-w-xs" hint={t.daysHint} {...(days !== "" && !daysCheck.success ? { error: issueText(daysCheck.error.issues[0]?.code, { int: t.daysInt, min: t.daysMin, max: t.daysMax }) } : {})}>
          <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </ReasonDialog>
    </>
  );
}
