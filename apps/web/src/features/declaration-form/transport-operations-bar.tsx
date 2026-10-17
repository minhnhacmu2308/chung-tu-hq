"use client";
// Hai nút nghiệp vụ ở đầu nhóm "Vận đơn & vận chuyển": Chia tách vận đơn (chỉ nhập khẩu), Khai báo định danh. Mỗi nút mở panel đủ chỉ tiêu
// theo đặc tả FPT, điền sẵn từ tờ khai; phần kết quả Hải quan trả về chỉ đọc. Bản mẫu: gửi / hỏi kết quả chỉ báo "chưa kết nối".
import { Button, Dialog, DialogContent, DialogFooter, Stack, toast } from "@kb/ui";
import type { TransportOperationForm } from "@kb/contracts";
import { QrCode, Split } from "lucide-react";
import { useState } from "react";
import { BlockView } from "./block-view";
import type { Stage } from "./fixtures";
import { conditionContext, type FormValues } from "./form-state";
import { operationValues, operationsFor } from "./transport-operations";

type Kind = "IDA" | "EDA";
const ICON: Record<TransportOperationForm["id"], typeof Split> = { "tach-van-don": Split, "dinh-danh": QrCode };

function OperationDialog({ form, kind, header, stage, showInapplicable, onClose }: { form: TransportOperationForm; kind: Kind; header: FormValues; stage: Stage; showInapplicable: boolean; onClose: () => void }) {
  const [values, setValues] = useState<FormValues>(() => operationValues(form, kind, header, stage));
  const ctx = conditionContext(kind, values);
  const Icon = ICON[form.id];
  const notConnected = (what: string) => toast({ tone: "info", title: "Bản mẫu – chưa kết nối", description: `${what} (${form.api.request} / ${form.api.response})` });
  return (
    <DialogContent title={form.title} icon={<Icon className="h-4 w-4" />} description={form.description} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          notConnected(`Gửi ${form.title.toLowerCase()}`);
        }}
      >
        <Stack gap="md">
          {form.blocks.map((b) => (
            <BlockView key={b.id} kind={kind} block={b} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} ctx={ctx} showInapplicable={showInapplicable} />
          ))}
          {form.result.map((b) => (
            <BlockView key={b.id} kind={kind} block={b} values={values} ctx={ctx} showInapplicable={showInapplicable} />
          ))}
        </Stack>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Đóng</Button>
          <Button type="button" variant="secondary" onClick={() => notConnected("Hỏi kết quả")}>Hỏi kết quả</Button>
          <Button type="submit">Gửi khai báo</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function TransportOperationsBar({ kind, header, stage, showInapplicable }: { kind: Kind; header: FormValues; stage: Stage; showInapplicable: boolean }) {
  const [open, setOpen] = useState<TransportOperationForm["id"] | null>(null);
  const forms = operationsFor(kind);
  const current = forms.find((f) => f.id === open);
  return (
    <div className="flex flex-wrap gap-2">
      {forms.map((f) => {
        const Icon = ICON[f.id];
        return (
          <Button key={f.id} variant="secondary" leftIcon={<Icon className="h-4 w-4" />} onClick={() => setOpen(f.id)}>
            {f.menu}
          </Button>
        );
      })}
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)} defaultPresentation="panel">
        {current && <OperationDialog key={current.id} form={current} kind={kind} header={header} stage={stage} showInapplicable={showInapplicable} onClose={() => setOpen(null)} />}
      </Dialog>
    </div>
  );
}
