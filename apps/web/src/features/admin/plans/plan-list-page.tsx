"use client";
import { UpdatePlanInputSchema, type AdminPlan } from "@kb/contracts";
import { Alert, Badge, Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, Field, Grid, Input, PageHeader, SkeletonCard, Stack, Textarea } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { adminKeys, listAdminPlans, updateAdminPlan } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatVnd } from "@/lib/format";
import { PLAN_TONE } from "../common/admin-display";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";

type Draft = { name: string; dossiersPerMonth: string; pagesPerDossier: string; priceVnd: string; reason: string };
type Errors = Partial<Record<keyof Draft, string>>;

const toInt = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
/** Người dùng gõ "3.990.000" hay "3 990 000" đều được – bỏ dấu phân cách trước khi kiểm tra. */
const cleanMoney = (s: string) => s.replace(/[.\s,]/g, "");

function EditPlanDialog({ plan, onClose }: { plan: AdminPlan | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>({ name: "", dossiersPerMonth: "", pagesPerDossier: "", priceVnd: "", reason: "" });
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (plan) {
      setDraft({ name: plan.name, dossiersPerMonth: String(plan.dossiersPerMonth), pagesPerDossier: String(plan.pagesPerDossier), priceVnd: plan.priceVnd, reason: "" });
      setErrors({});
    }
  }, [plan]);

  const save = useAdminMutation({
    mutationFn: (input: Parameters<typeof updateAdminPlan>[1]) => updateAdminPlan(plan!.code, input),
    success: (p) => `Đã lưu gói ${p.name}`,
    errorTitle: "Không lưu được gói",
    onSuccess: onClose,
  });

  const submit = () => {
    const parsed = UpdatePlanInputSchema.safeParse({
      name: draft.name,
      dossiersPerMonth: toInt(draft.dossiersPerMonth),
      pagesPerDossier: toInt(draft.pagesPerDossier),
      priceVnd: cleanMoney(draft.priceVnd),
      reason: draft.reason,
    });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Draft;
        found[key] ??= key === "priceVnd" ? "Nhập số tiền, vd 3990000" : issue.message;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const err = (k: keyof Draft) => (errors[k] ? { error: errors[k] } : {});

  return (
    <Dialog open={plan !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Sửa gói ${plan?.name ?? ""}`} size="sm" icon={<Pencil className="h-4 w-4" />} allowPresentationToggle={false}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="md">
            {plan && plan.orgCount > 0 && (
              <Alert tone="warning">
                Hạn mức mới áp dụng ngay cho {formatNumber(plan.orgCount)} doanh nghiệp đang dùng gói này. Giá mới tính từ kỳ thanh toán sau.
              </Alert>
            )}
            <Field label="Tên gói" required {...err("name")}>
              <Input value={draft.name} onChange={set("name")} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Hồ sơ / tháng" required {...err("dossiersPerMonth")}>
                <Input inputMode="numeric" value={draft.dossiersPerMonth} onChange={set("dossiersPerMonth")} />
              </Field>
              <Field label="Trang / hồ sơ" required {...err("pagesPerDossier")}>
                <Input inputMode="numeric" value={draft.pagesPerDossier} onChange={set("pagesPerDossier")} />
              </Field>
            </div>
            <Field label="Giá mỗi tháng (VND)" required hint={plan?.customPricing ? "Gói theo hợp đồng: đây là giá tham chiếu để ước tính doanh thu." : "Nhập 0 cho gói miễn phí."} {...err("priceVnd")}>
              <Input inputMode="numeric" value={draft.priceVnd} onChange={set("priceVnd")} />
            </Field>
            <Field label="Lý do" required hint="Ghi vào nhật ký quản trị." {...err("reason")}>
              <Textarea value={draft.reason} onChange={set("reason")} rows={3} maxLength={500} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Hủy</Button>
            <Button type="submit" loading={save.isPending}>Lưu gói</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlanListPage() {
  const { can } = useAdminSession();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans });
  const [editing, setEditing] = useState<AdminPlan | null>(null);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Gói dịch vụ"
        description="Danh mục gói bán cho khách: hạn mức hồ sơ mỗi tháng, số trang tối đa mỗi hồ sơ và giá. Đổi gói cho một doanh nghiệp cụ thể làm ở trang doanh nghiệp đó."
      />
      {isError ? (
        <LoadError onRetry={() => void refetch()} title="Không tải được danh mục gói" />
      ) : isLoading || !data ? (
        <Grid cols={{ base: 1, md: 2, xl: 4 }}>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={4} />)}</Grid>
      ) : (
        <Grid cols={{ base: 1, md: 2, xl: 4 }} stagger>
          {data.map((p) => (
            <Card key={p.code} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {p.name} <Badge tone={PLAN_TONE[p.code]} variant="outline" size="sm" className="font-mono">{p.code}</Badge>
                </CardTitle>
                <p className="text-xl font-semibold text-fg">
                  {p.customPricing ? "Theo hợp đồng" : Number(p.priceVnd) === 0 ? "Miễn phí" : `${formatVnd(p.priceVnd)}/tháng`}
                </p>
                {p.customPricing && <p className="text-xs text-fg-subtle">Giá tham chiếu {formatVnd(p.priceVnd)}/tháng</p>}
              </CardHeader>
              <CardContent className="flex-1">
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-fg-muted">Hồ sơ mỗi tháng</dt><dd className="font-medium tabular-nums text-fg">{formatNumber(p.dossiersPerMonth)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-fg-muted">Trang mỗi hồ sơ</dt><dd className="font-medium tabular-nums text-fg">{formatNumber(p.pagesPerDossier)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-fg-muted">Doanh nghiệp đang dùng</dt><dd className="font-medium tabular-nums text-fg">{formatNumber(p.orgCount)}</dd></div>
                </dl>
              </CardContent>
              {can("BILLING") && (
                <CardFooter>
                  <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(p)}>Sửa gói</Button>
                </CardFooter>
              )}
            </Card>
          ))}
        </Grid>
      )}
      <EditPlanDialog plan={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}
