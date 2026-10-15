"use client";
// Các thao tác trên một doanh nghiệp (khóa/mở, đổi gói, nới hạn mức, gia hạn dùng thử). Dùng ở cả danh sách lẫn trang chi tiết.
import { AdjustOrgQuotaInputSchema, ExtendOrgTrialInputSchema, type AdminOrg, type PlanCode } from "@kb/contracts";
import { Alert, Field, Input, Select } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Gauge, Lock, LockOpen, Repeat } from "lucide-react";
import { useEffect, useState } from "react";
import { adjustOrgQuota, adminKeys, changeOrgPlan, extendOrgTrial, listAdminPlans, reactivateOrg, suspendOrg } from "@/api/admin";
import { formatDate, formatNumber } from "@/lib/format";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";

export type OrgAction = "suspend" | "reactivate" | "plan" | "quota" | "trial";

type Props = { org: Pick<AdminOrg, "id" | "name" | "plan" | "quotaBonus" | "usage">; action: OrgAction | null; onClose: () => void };

/** Số nguyên từ ô nhập; rỗng hoặc không phải số → NaN để schema báo lỗi. */
const toInt = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

export function OrgActionDialogs({ org, action, onClose }: Props) {
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
  const suspend = useAdminMutation({ mutationFn: (reason: string) => suspendOrg(org.id, { reason }), success: () => `Đã tạm khóa ${org.name}`, errorTitle: "Không khóa được doanh nghiệp", ...done });
  const reactivate = useAdminMutation({ mutationFn: (reason: string) => reactivateOrg(org.id, { reason }), success: () => `Đã mở khóa ${org.name}`, errorTitle: "Không mở khóa được doanh nghiệp", ...done });
  const plan = useAdminMutation({
    mutationFn: (v: { planCode: PlanCode; reason: string }) => changeOrgPlan(org.id, v),
    success: (o) => `Đã chuyển sang gói ${o.plan.name}`,
    errorTitle: "Không đổi được gói",
    ...done,
  });
  const quota = useAdminMutation({
    mutationFn: (v: { bonusDossiers: number; reason: string }) => adjustOrgQuota(org.id, v),
    success: (o) => (o.quotaBonus > 0 ? `Đã nới thêm ${formatNumber(o.quotaBonus)} hồ sơ` : "Đã bỏ phần nới hạn mức"),
    errorTitle: "Không đổi được hạn mức",
    ...done,
  });
  const trial = useAdminMutation({
    mutationFn: (v: { days: number; reason: string }) => extendOrgTrial(org.id, v),
    success: (o) => `Dùng thử kéo dài tới ${formatDate(o.plan.renewsAt)}`,
    errorTitle: "Không gia hạn được dùng thử",
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
        title="Tạm khóa doanh nghiệp?"
        icon={<Lock className="h-4 w-4" />}
        description={org.name}
        confirmLabel="Tạm khóa"
        tone="danger"
        pending={suspend.isPending}
        reasonHint="Lý do này hiện cho cả đội vận hành ở trang doanh nghiệp và trong nhật ký."
        onConfirm={(reason) => suspend.mutate(reason)}
      >
        <Alert tone="warning">Mọi thành viên của doanh nghiệp không dùng được hệ thống cho tới khi mở khóa. Dữ liệu hồ sơ vẫn được giữ nguyên.</Alert>
      </ReasonDialog>

      <ReasonDialog
        open={action === "reactivate"}
        onOpenChange={onOpenChange}
        title="Mở khóa doanh nghiệp?"
        icon={<LockOpen className="h-4 w-4" />}
        description={org.name}
        confirmLabel="Mở khóa"
        pending={reactivate.isPending}
        onConfirm={(reason) => reactivate.mutate(reason)}
      />

      <ReasonDialog
        open={action === "plan"}
        onOpenChange={onOpenChange}
        title="Đổi gói dịch vụ"
        icon={<Repeat className="h-4 w-4" />}
        description={`${org.name} · đang dùng gói ${org.plan.name}`}
        confirmLabel="Đổi gói"
        pending={plan.isPending}
        canSubmit={planCode !== ""}
        onConfirm={(reason) => planCode !== "" && plan.mutate({ planCode, reason })}
      >
        <Field label="Gói mới" required hint={nextPlan ? `${formatNumber(nextPlan.dossiersPerMonth)} hồ sơ/tháng · ${nextPlan.pagesPerDossier} trang/hồ sơ. Kỳ mới tính từ hôm nay.` : "Hạn mức mới áp dụng ngay."}>
          <Select
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value as PlanCode | "")}
            placeholder={plans.isLoading ? "Đang tải danh sách gói…" : "Chọn gói"}
            options={(plans.data ?? []).filter((p) => p.code !== org.plan.code).map((p) => ({ value: p.code, label: p.name }))}
          />
        </Field>
        {nextPlan && org.usage.dossiersThisMonth > nextPlan.dossiersPerMonth && (
          <Alert tone="warning">
            Tháng này doanh nghiệp đã dùng {formatNumber(org.usage.dossiersThisMonth)} hồ sơ – vượt hạn mức {formatNumber(nextPlan.dossiersPerMonth)} của gói {nextPlan.name}.
          </Alert>
        )}
      </ReasonDialog>

      <ReasonDialog
        open={action === "quota"}
        onOpenChange={onOpenChange}
        title="Nới hạn mức tạm thời"
        icon={<Gauge className="h-4 w-4" />}
        description={`${org.name} · gói ${org.plan.name}: ${formatNumber(org.plan.dossiersPerMonth)} hồ sơ/tháng`}
        confirmLabel="Lưu hạn mức"
        pending={quota.isPending}
        canSubmit={bonusCheck.success}
        onConfirm={(reason) => bonusCheck.success && quota.mutate({ bonusDossiers: bonusCheck.data, reason })}
      >
        <Field
          label="Số hồ sơ cộng thêm trong tháng này"
          required
          className="cq-md:max-w-xs"
          hint="Chỉ có hiệu lực tới hết kỳ hiện tại. Nhập 0 để bỏ phần đã nới."
          {...(bonus !== "" && !bonusCheck.success ? { error: bonusCheck.error.issues[0]?.message } : {})}
        >
          <Input inputMode="numeric" value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </Field>
      </ReasonDialog>

      <ReasonDialog
        open={action === "trial"}
        onOpenChange={onOpenChange}
        title="Gia hạn dùng thử"
        icon={<CalendarPlus className="h-4 w-4" />}
        description={`${org.name} · dùng thử tới ${formatDate(org.plan.renewsAt)}`}
        confirmLabel="Gia hạn"
        pending={trial.isPending}
        canSubmit={daysCheck.success}
        onConfirm={(reason) => daysCheck.success && trial.mutate({ days: daysCheck.data, reason })}
      >
        <Field label="Số ngày thêm" required className="cq-md:max-w-xs" hint="Từ 1 đến 90 ngày." {...(days !== "" && !daysCheck.success ? { error: daysCheck.error.issues[0]?.message } : {})}>
          <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </ReasonDialog>
    </>
  );
}
