"use client";
// Tab "Hải quan trả về" và "Theo dõi & nghiệp vụ" của form đầy đủ, chạy trên dữ liệu truyền Hải quan thật của hồ sơ (bước Review).
// Chỉ đọc: thực hiện nghiệp vụ (khai tạm/chính thức, gọi về sửa, sửa đổi, HYS…) ở bước Khai báo Hải quan – tab này dẫn sang đó.
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Stack, useMessages, useUiLocale } from "@kb/ui";
import { layoutFor, type CustomsInfo, type LineItem, type SubmissionView } from "@kb/contracts";
import { ArrowRight, Send } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { MessageLog, pipeStatus } from "../dossier-detail/steps/submit-step";
import { customsItemValues, customsValues } from "./customs-adapter";
import { CustomsTab } from "./customs-tab";
import { FORM_MESSAGES } from "./form.messages";
import { itemValues } from "./dossier-adapter";
import { TaxCard } from "./operations-tab";

type Kind = "IDA" | "EDA";

/** Hải quan trả về – đủ chỉ tiêu theo Phụ lục II; khối chưa có dữ liệu hiện "Có sau khi …". */
export function DossierCustomsTab({ kind, submission, items }: { kind: Kind; submission: SubmissionView | undefined; items: LineItem[] }) {
  const info: CustomsInfo | null = submission?.customsInfo ?? null;
  const values = customsValues(kind, info, submission?.result ?? null);
  const hs = itemValues(kind, items);
  const rows = customsItemValues(kind, info, items.map((it) => it.lineNo)).map((v, i) => ({ HAG_CMD: hs[i]?.["HAG_CMD"] ?? "", ...v }));
  return <CustomsTab layout={layoutFor(kind)} values={values} items={rows} />;
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
      <TaxCard kind={kind} values={values} edi={false} />
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
