"use client";
// Tab 3 – Theo dõi & nghiệp vụ (≈ tab "Quản lý tờ khai" của phần mềm): thông điệp Hải quan, thông tin thuế tờ khai + Ghi/Open EDI,
// nghiệp vụ bổ sung, tra cứu, số hóa chứng từ. Nháp: chỉ nghiệp vụ dùng được khi chưa có số tờ khai. Bản mẫu: nút chỉ báo "chưa kết nối".
import { Button, Card, CardContent, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, EmptyState, Field, Grid, Stack, Textarea, toast } from "@kb/ui";
import { FileDown, FileStack, FileUp, Receipt, Save, Search } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { PrototypeFixture, Stage } from "./fixtures";
import type { FormValues } from "./form-state";
import { lookupsAt, operationsAt, taxAmount, taxSummary } from "./stage-rules";

type Message = PrototypeFixture["messages"][number];
const col = createDataTableColumnHelper<Message>();
const columns = col.columns([
  col.accessor("code", { header: "Mã thông điệp", cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
  col.accessor("name", { header: "Tên thông điệp", meta: { wrap: true } }),
  col.accessor("at", { header: "Thời gian", cell: (c) => formatDateTime(c.getValue()) }),
]);

const notConnected = (name: string) => () => toast({ tone: "info", title: "Bản mẫu – chưa kết nối", description: name });

const CANCEL = "Cập nhật trạng thái tờ khai hủy";

/** `edi`: nút Ghi / Open EDI (bản mẫu – chưa kết nối). */
export function TaxCard({ kind, values, edi = true }: { kind: "IDA" | "EDA"; values: FormValues; edi?: boolean }) {
  const tax = taxSummary(kind, values);
  const rows = tax ? [...(tax.rate ? [{ label: `Tỷ giá tính thuế (${tax.rate.currency})`, value: taxAmount(tax.rate.value) }] : []), ...tax.lines.map((l) => ({ label: l.label, value: taxAmount(l.value) })), ...(tax.total ? [{ label: "Tổng tiền thuế (VND)", value: taxAmount(tax.total) }] : [])] : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Thông tin thuế tờ khai</CardTitle>
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
            <EmptyState icon={<Receipt />} title="Chưa có số thuế" description={edi ? "Tỷ giá và tiền thuế có sau khi Hải quan tiếp nhận tờ khai. Bản mẫu chưa tạm tính thuế." : "Tỷ giá và tiền thuế chính thức có sau khi Hải quan tiếp nhận tờ khai (khai tạm)."} />
          )}
          {edi && <div className="flex flex-wrap gap-2">
            <Button variant="secondary" leftIcon={<Save className="h-4 w-4" />} onClick={notConnected("Ghi EDI")}>Ghi EDI</Button>
            <Button variant="secondary" leftIcon={<FileDown className="h-4 w-4" />} onClick={notConnected("Open EDI")}>Open EDI</Button>
          </div>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OperationsTab({ kind, fixture, stage, values }: { kind: "IDA" | "EDA"; fixture: PrototypeFixture; stage: Stage; values: FormValues }) {
  const messages = stage === "nhap" ? [] : stage === "da-khai" ? fixture.messages.slice(0, 2) : fixture.messages;
  const operations = operationsAt(stage);
  const lookups = lookupsAt(stage);
  return (
    <Stack gap="lg">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Thông điệp Hải quan</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length ? (
            <DataTable aria-label="Thông điệp Hải quan" columns={columns} data={messages} getRowId={(m) => m.code + m.at} />
          ) : (
            <EmptyState icon={<FileStack />} title="Chưa có thông điệp" description="Thông điệp gửi/nhận với Hải quan hiện ở đây sau khi khai báo." />
          )}
        </CardContent>
      </Card>
      <TaxCard kind={kind} values={values} />
      <Grid cols={{ base: 1, lg: lookups.length ? 2 : 1 }} gap="lg">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Nghiệp vụ bổ sung</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap="sm">
              {operations.map((o) => (
                <Button key={o} variant="secondary" className="justify-start" leftIcon={<FileUp className="h-4 w-4" />} onClick={notConnected(o)}>
                  {o}
                </Button>
              ))}
              {operations.includes(CANCEL) && (
                <Field label="Lý do hủy tờ khai">
                  <Textarea rows={2} placeholder="Nhập khi cập nhật hủy tờ khai" />
                </Field>
              )}
            </Stack>
          </CardContent>
        </Card>
        {lookups.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle as="h2">Tra cứu tờ khai</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap="sm">
                {lookups.map((o) => (
                  <Button key={o} variant="secondary" className="justify-start" leftIcon={<Search className="h-4 w-4" />} onClick={notConnected(o)}>
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
          <CardTitle as="h2">Số hóa chứng từ</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={<FileStack />} title="Chưa có chứng từ số hóa" description="Chứng từ đính kèm gửi Hải quan (HYS) hiện ở đây." action={<Button variant="secondary" onClick={notConnected("Số hóa chứng từ")}>Thêm chứng từ</Button>} />
        </CardContent>
      </Card>
    </Stack>
  );
}
