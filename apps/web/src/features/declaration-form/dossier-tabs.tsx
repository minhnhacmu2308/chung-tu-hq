"use client";
// Tab "Theo dõi & nghiệp vụ" ở bước Review, chạy trên dữ liệu truyền Hải quan thật của hồ sơ: thông điệp, thông tin thuế, trạng thái nghiệp vụ.
// Chỉ đọc: thực hiện nghiệp vụ (khai tạm/chính thức, gọi về sửa, sửa đổi, HYS…) ở bước Khai báo Hải quan – tab này dẫn sang đó.
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, fill, Stack, useMessages, useUiLocale } from "@kb/ui";
import type { SubmissionView } from "@kb/contracts";
import { ArrowRight, Receipt, Send } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { MessageLog, pipeStatus } from "../dossier-detail/steps/submit-step";
import { customsValues } from "./customs-adapter";
import { FORM_MESSAGES } from "./form.messages";
import type { FormValues } from "./form-state";
import { taxAmount, taxSummary } from "./stage-rules";

type Kind = "IDA" | "EDA";

/** Thông tin thuế tờ khai (≈ tab "Quản lý tờ khai" của phần mềm) – chỉ từ số liệu Hải quan đã trả; chưa có → trống. */
function TaxCard({ kind, values }: { kind: Kind; values: FormValues }) {
  const t = useMessages(FORM_MESSAGES);
  const tax = taxSummary(kind, values, useUiLocale());
  const rows = tax ? [...(tax.rate ? [{ label: fill(t.taxRate, { c: tax.rate.currency }), value: taxAmount(tax.rate.value) }] : []), ...tax.lines.map((l) => ({ label: l.label, value: taxAmount(l.value) })), ...(tax.total ? [{ label: t.totalTax, value: taxAmount(tax.total) }] : [])] : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t.taxTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {tax ? (
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {rows.map((r) => (
              <div key={r.label} className="flex min-w-0 flex-col">
                <dt className="text-xs text-fg-muted">{r.label}</dt>
                <dd className="text-sm font-medium tabular-nums text-fg">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState icon={<Receipt />} title={t.noTax} description={t.noTaxReal} />
        )}
      </CardContent>
    </Card>
  );
}

/** Theo dõi & nghiệp vụ – thông điệp gửi/nhận, thuế chính thức, trạng thái từng nghiệp vụ; thao tác ở bước Khai báo Hải quan. */
/** `onGoSubmit` không truyền (tờ khai còn nháp) → không có nút sang bước Khai báo. */
export function DossierOperationsTab({ kind, submission, onGoSubmit }: { kind: Kind; submission: SubmissionView | undefined; onGoSubmit?: (() => void) | undefined }) {
  const t = useMessages(FORM_MESSAGES);
  const pipe = pipeStatus(useUiLocale());
  const values = customsValues(kind, submission?.customsInfo ?? null, submission?.result ?? null);
  const rows = (submission?.pipeline ?? []).filter((r) => r.status !== "NOT_SENT" || r.enabled);
  return (
    <Stack gap="lg">
      <MessageLog messages={submission?.messages ?? []} />
      <TaxCard kind={kind} values={values} />
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t.opsTitle}</CardTitle>
          <CardDescription>{t.opsDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="md">
            {rows.length ? (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {rows.map((r) => (
                  <li key={r.op} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <Badge tone="neutral" variant="outline" className="font-mono">{r.op}</Badge>
                    <span className="min-w-0 flex-1 text-sm text-fg">
                      {r.label}
                      {r.summary && <span className="block text-xs text-fg-muted">{r.summary}</span>}
                    </span>
                    <Badge tone={r.enabled && r.status === "NOT_SENT" ? "info" : pipe[r.status].tone}>{r.enabled && r.status === "NOT_SENT" ? t.ready : pipe[r.status].text}</Badge>
                    {r.at && <span className="text-xs tabular-nums text-fg-subtle">{formatDateTime(r.at)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Send />} title={t.noOps} description={t.noOpsDesc} />
            )}
            {onGoSubmit && (
              <div>
                <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={onGoSubmit}>
                  {t.goSubmit}
                </Button>
              </div>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
