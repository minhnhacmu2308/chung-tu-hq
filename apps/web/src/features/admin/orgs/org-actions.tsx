"use client";
// Các thao tác trên một doanh nghiệp (khóa/mở, đổi loại gói, điều chỉnh lượt, hợp đồng năm – ADR 0011). Dùng ở cả danh sách lẫn trang chi tiết.
import {
  AdjustOrgCreditsInputSchema, UpsertOrgContractInputSchema, type AdminOrg, type AdminOrgDetail, type ManualCreditReason, type PlanCode,
} from "@kb/contracts";
import { Alert, DatePicker, Field, fill, Grid, Input, Select, Textarea, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Coins, FileSignature, Lock, LockOpen, Repeat } from "lucide-react";
import { useEffect, useState } from "react";
import { adjustOrgCredits, adminKeys, changeOrgPlan, listAdminPlans, reactivateOrg, suspendOrg, upsertOrgContract } from "@/api/admin";
import { CREDIT_REASON_LABELS } from "@/components/common/billing-display.messages";
import { formatNumber } from "@/lib/format";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { ORG_ACTIONS_MESSAGES } from "./orgs.messages";

export type OrgAction = "suspend" | "reactivate" | "plan" | "credits" | "contract";

type Props = {
  org: Pick<AdminOrg, "id" | "name" | "plan" | "usage" | "billing"> & Partial<Pick<AdminOrgDetail, "contract">>;
  action: OrgAction | null;
  onClose: () => void;
};

const MANUAL_KINDS: ManualCreditReason[] = ["MANUAL_TOPUP", "GRANT", "REFUND", "ADJUST"];
/** "250.000" / "250 000" → "250000". */
const cleanMoney = (s: string) => s.replace(/[.\s,]/g, "");
const toInt = (s: string) => (/^[+-]?\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);

/** Khóa ngẫu nhiên 32 ký tự hex (crypto.randomUUID có ở trình duyệt hiện đại và jsdom). */
const newIdempotencyKey = () => crypto.randomUUID().replace(/-/g, "");

type CreditsDraft = { kind: ManualCreditReason; delta: string; amount: string; note: string };
type CreditsErrors = Partial<Record<"delta" | "amount" | "note", string>>;

/** Hộp "Điều chỉnh lượt": loại (nạp tay / tặng / hoàn / điều chỉnh), số lượt ±, số tiền (tùy chọn), ghi chú cho khách, lý do (nhật ký). */
function AdjustCreditsDialog({ org, open, onClose }: { org: Props["org"]; open: boolean; onClose: () => void }) {
  const t = useMessages(ORG_ACTIONS_MESSAGES);
  const kinds = useMessages(CREDIT_REASON_LABELS);
  const [d, setD] = useState<CreditsDraft>({ kind: "MANUAL_TOPUP", delta: "", amount: "", note: "" });
  const [errors, setErrors] = useState<CreditsErrors>({});
  // Khóa chống ghi trùng: một khóa mỗi lần mở hộp – bấm Xác nhận hai lần / gửi lại sau lỗi mạng không thành hai dòng sổ lượt.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  useEffect(() => {
    if (open) {
      setD({ kind: "MANUAL_TOPUP", delta: "", amount: "", note: "" });
      setErrors({});
      setIdempotencyKey(newIdempotencyKey());
    }
  }, [open]);
  const save = useAdminMutation({
    mutationFn: (input: Parameters<typeof adjustOrgCredits>[1]) => adjustOrgCredits(org.id, input),
    success: (_r, v) => fill(t.creditsToast, { delta: v.delta > 0 ? `+${formatNumber(v.delta)}` : formatNumber(v.delta), name: org.name }),
    errorTitle: t.creditsError,
    onSuccess: onClose,
  });
  const set = (k: keyof CreditsDraft) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: keyof CreditsErrors) => (errors[k] ? { error: errors[k] } : {});
  const confirm = (reason: string) => {
    const amount = cleanMoney(d.amount);
    const parsed = AdjustOrgCreditsInputSchema.safeParse({ delta: toInt(d.delta), kind: d.kind, note: d.note, ...(amount ? { amountVnd: amount } : {}), idempotencyKey, reason });
    if (!parsed.success) {
      // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt → hiển thị theo trường lỗi.
      const found: CreditsErrors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0];
        if (k === "delta") found.delta ??= i.code === "custom" && Number.isInteger(toInt(d.delta)) && toInt(d.delta) !== 0 ? t.deltaPositive : t.deltaInvalid;
        if (k === "amountVnd") found.amount ??= t.amountInvalid;
        if (k === "note") found.note ??= t.creditNoteInvalid;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };
  return (
    <ReasonDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t.creditsTitle}
      icon={<Coins className="h-4 w-4" />}
      description={fill(t.creditsDescription, { name: org.name, n: formatNumber(org.billing.balance) })}
      confirmLabel={t.creditsConfirm}
      pending={save.isPending}
      reasonHint={t.creditsReasonHint}
      onConfirm={confirm}
    >
      <Field label={t.creditKind} required hint={t.creditKindHint}>
        <Select value={d.kind} onChange={(e) => setD((x) => ({ ...x, kind: e.target.value as ManualCreditReason }))} options={MANUAL_KINDS.map((k) => ({ value: k, label: kinds[k] }))} />
      </Field>
      <Grid cols={{ base: 1, sm: 2 }}>
        <Field label={t.delta} required hint={t.deltaHint} {...err("delta")}>
          <Input inputMode="numeric" value={d.delta} onChange={set("delta")} placeholder={t.deltaPlaceholder} />
        </Field>
        <Field label={t.amount} hint={t.amountHint} {...err("amount")}>
          <Input inputMode="numeric" value={d.amount} onChange={set("amount")} placeholder={t.amountPlaceholder} />
        </Field>
      </Grid>
      <Field label={t.creditNote} required hint={t.creditNoteHint} {...err("note")}>
        <Textarea value={d.note} onChange={set("note")} rows={2} maxLength={500} placeholder={t.creditNotePlaceholder} />
      </Field>
    </ReasonDialog>
  );
}

type ContractDraft = { contractNo: string; startsOn: string | null; endsOn: string | null; value: string; note: string };
type ContractErrors = Partial<Record<"endsOn" | "value", string>>;

/** Hộp "Hợp đồng năm": số hợp đồng, bắt đầu, kết thúc, giá trị, ghi chú nội bộ (PUT /api/admin/orgs/[id]/contract). */
function ContractDialog({ org, open, onClose }: { org: Props["org"]; open: boolean; onClose: () => void }) {
  const t = useMessages(ORG_ACTIONS_MESSAGES);
  const [d, setD] = useState<ContractDraft>({ contractNo: "", startsOn: null, endsOn: null, value: "", note: "" });
  const [errors, setErrors] = useState<ContractErrors>({});
  useEffect(() => {
    if (!open) return;
    const c = org.contract;
    setD({ contractNo: c?.contractNo ?? "", startsOn: c?.startsOn ?? null, endsOn: c?.endsOn ?? null, value: c && c.valueVnd !== "0" ? c.valueVnd : "", note: c?.note ?? "" });
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = useAdminMutation({
    mutationFn: (input: Parameters<typeof upsertOrgContract>[1]) => upsertOrgContract(org.id, input),
    success: () => fill(t.contractToast, { name: org.name }),
    errorTitle: t.contractError,
    onSuccess: onClose,
  });
  const set = (k: "contractNo" | "value" | "note") => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  const confirm = (reason: string) => {
    const parsed = UpsertOrgContractInputSchema.safeParse({
      ...(d.contractNo.trim() ? { contractNo: d.contractNo } : {}),
      ...(d.startsOn ? { startsOn: d.startsOn } : {}),
      ...(d.endsOn ? { endsOn: d.endsOn } : {}),
      valueVnd: cleanMoney(d.value) || "0",
      ...(d.note.trim() ? { note: d.note } : {}),
      reason,
    });
    if (!parsed.success) {
      const found: ContractErrors = {};
      for (const i of parsed.error.issues) {
        if (i.path[0] === "endsOn") found.endsOn ??= t.rangeInvalid;
        if (i.path[0] === "valueVnd") found.value ??= t.valueInvalid;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };
  return (
    <ReasonDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t.contractTitle}
      icon={<FileSignature className="h-4 w-4" />}
      description={fill(t.contractDescription, { name: org.name })}
      confirmLabel={t.contractConfirm}
      pending={save.isPending}
      onConfirm={confirm}
    >
      <Field label={t.contractNo}>
        <Input value={d.contractNo} onChange={set("contractNo")} placeholder={t.contractNoPlaceholder} maxLength={100} />
      </Field>
      <Grid cols={{ base: 1, sm: 2 }}>
        <Field label={t.startsOn}>
          <DatePicker value={d.startsOn} onChange={(v) => setD((x) => ({ ...x, startsOn: v }))} />
        </Field>
        <Field label={t.endsOn} hint={t.endsOnHint} {...(errors.endsOn ? { error: errors.endsOn } : {})}>
          <DatePicker value={d.endsOn} onChange={(v) => setD((x) => ({ ...x, endsOn: v }))} />
        </Field>
      </Grid>
      <Field label={t.value} required hint={t.valueHint} {...(errors.value ? { error: errors.value } : {})}>
        <Input inputMode="numeric" value={d.value} onChange={set("value")} placeholder={t.valuePlaceholder} className="cq-sm:max-w-xs" />
      </Field>
      <Field label={t.contractNote}>
        <Textarea value={d.note} onChange={set("note")} rows={2} maxLength={2000} placeholder={t.contractNotePlaceholder} />
      </Field>
    </ReasonDialog>
  );
}

export function OrgActionDialogs({ org, action, onClose }: Props) {
  const t = useMessages(ORG_ACTIONS_MESSAGES);
  const plans = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans, enabled: action === "plan" });
  const [planCode, setPlanCode] = useState<PlanCode | "">("");
  useEffect(() => {
    if (action === "plan") setPlanCode("");
  }, [action]);

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
        <Field label={t.newPlan} required hint={t.newPlanHintEmpty}>
          <Select
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value as PlanCode | "")}
            placeholder={plans.isLoading ? t.loadingPlans : t.choosePlan}
            options={(plans.data ?? []).filter((p) => p.code !== org.plan.code).map((p) => ({ value: p.code, label: p.name }))}
          />
        </Field>
      </ReasonDialog>

      <AdjustCreditsDialog org={org} open={action === "credits"} onClose={onClose} />
      <ContractDialog org={org} open={action === "contract"} onClose={onClose} />
    </>
  );
}
