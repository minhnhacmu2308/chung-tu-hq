"use client";
// Tab 3 – Theo dõi & nghiệp vụ (≈ tab "Quản lý tờ khai" của phần mềm): thông điệp Hải quan, thông tin thuế tờ khai + Ghi/Open EDI,
// nghiệp vụ bổ sung, tra cứu, số hóa chứng từ. Nháp: chỉ nghiệp vụ dùng được khi chưa có số tờ khai. Bản mẫu: nút chỉ báo "chưa kết nối".
import { Button, Card, CardContent, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, EmptyState, Field, fill, Grid, Stack, Textarea, toast, useMessages, useUiLocale } from "@kb/ui";
import { FileDown, FileStack, FileUp, Receipt, Save, Search } from "lucide-react";
import { useMemo } from "react";
import { formatDateTime } from "@/lib/format";
import { FORM_MESSAGES } from "./form.messages";
import type { PrototypeFixture, Stage } from "./fixtures";
import type { FormValues } from "./form-state";
import { lookupsAt, operationsAt, taxAmount, taxSummary } from "./stage-rules";

type Message = PrototypeFixture["messages"][number];
const col = createDataTableColumnHelper<Message>();

const notConnected = (title: string, name: string) => () => toast({ tone: "info", title, description: name });

/** `edi`: nút Ghi / Open EDI (bản mẫu – chưa kết nối). */
export function TaxCard({ kind, values, edi = true }: { kind: "IDA" | "EDA"; values: FormValues; edi?: boolean }) {
  const t = useMessages(FORM_MESSAGES);
  const tax = taxSummary(kind, values, useUiLocale());
  const rows = tax ? [...(tax.rate ? [{ label: fill(t.taxRate, { c: tax.rate.currency }), value: taxAmount(tax.rate.value) }] : []), ...tax.lines.map((l) => ({ label: l.label, value: taxAmount(l.value) })), ...(tax.total ? [{ label: t.totalTax, value: taxAmount(tax.total) }] : [])] : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t.taxTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <Stack gap="md">
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
            <EmptyState icon={<Receipt />} title={t.noTax} description={edi ? t.noTaxProto : t.noTaxReal} />
          )}
          {edi && <div className="flex flex-wrap gap-2">
            <Button variant="secondary" leftIcon={<Save className="h-4 w-4" />} onClick={notConnected(t.prototypeNotConnected, t.saveEdi)}>{t.saveEdi}</Button>
            <Button variant="secondary" leftIcon={<FileDown className="h-4 w-4" />} onClick={notConnected(t.prototypeNotConnected, t.openEdi)}>{t.openEdi}</Button>
          </div>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OperationsTab({ kind, fixture, stage, values }: { kind: "IDA" | "EDA"; fixture: PrototypeFixture; stage: Stage; values: FormValues }) {
  const messages = stage === "nhap" ? [] : stage === "da-khai" ? fixture.messages.slice(0, 2) : fixture.messages;
  const t = useMessages(FORM_MESSAGES);
  const locale = useUiLocale();
  const operations = operationsAt(stage, locale);
  const lookups = lookupsAt(stage, locale);
  const columns = useMemo(
    () => col.columns([
      col.accessor("code", { header: t.colMsgCode, cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
      col.accessor("name", { header: t.colMsgName, meta: { wrap: true } }),
      col.accessor("at", { header: t.colTime, cell: (c) => formatDateTime(c.getValue()) }),
    ]),
    [t],
  );
  return (
    <Stack gap="lg">
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t.msgTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length ? (
            <DataTable aria-label={t.msgTitle} columns={columns} data={messages} getRowId={(m) => m.code + m.at} />
          ) : (
            <EmptyState icon={<FileStack />} title={t.noMsg} description={t.noMsgDesc} />
          )}
        </CardContent>
      </Card>
      <TaxCard kind={kind} values={values} />
      <Grid cols={{ base: 1, lg: lookups.length ? 2 : 1 }} gap="lg">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t.extraOps}</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap="sm">
              {operations.map((o) => (
                <Button key={o} variant="secondary" className="justify-start" leftIcon={<FileUp className="h-4 w-4" />} onClick={notConnected(t.prototypeNotConnected, o)}>
                  {o}
                </Button>
              ))}
              {operations.includes(t.opCancel) && (
                <Field label={t.cancelReason}>
                  <Textarea rows={2} placeholder={t.cancelPh} />
                </Field>
              )}
            </Stack>
          </CardContent>
        </Card>
        {lookups.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t.lookupsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap="sm">
                {lookups.map((o) => (
                  <Button key={o} variant="secondary" className="justify-start" leftIcon={<Search className="h-4 w-4" />} onClick={notConnected(t.prototypeNotConnected, o)}>
                    {o}
                  </Button>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Grid>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t.digitize}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={<FileStack />} title={t.noDigitized} description={t.noDigitizedDesc} action={<Button variant="secondary" onClick={notConnected(t.prototypeNotConnected, t.digitize)}>{t.addDoc}</Button>} />
        </CardContent>
      </Card>
    </Stack>
  );
}
