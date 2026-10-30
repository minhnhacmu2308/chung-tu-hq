"use client";
// Hai nút nghiệp vụ ở đầu nhóm "Vận đơn & vận chuyển": Chia tách vận đơn (chỉ nhập khẩu), Khai báo định danh. Mỗi nút mở panel đủ chỉ tiêu
// theo đặc tả FPT, điền sẵn từ tờ khai; phần kết quả Hải quan trả về chỉ đọc. Bản mẫu: gửi / hỏi kết quả chỉ báo "chưa kết nối".
import { Button, Dialog, DialogContent, DialogFooter, fill, Stack, toast, useMessages } from "@kb/ui";
import type { TransportOperationForm } from "@kb/contracts";
import { QrCode, Split } from "lucide-react";
import { useState } from "react";
import { BlockView } from "./block-view";
import type { Stage } from "./fixtures";
import { FORM_MESSAGES } from "./form.messages";
import { conditionContext, type FormValues } from "./form-state";
import { operationValues, operationsFor } from "./transport-operations";

type Kind = "IDA" | "EDA";
const ICON: Record<TransportOperationForm["id"], typeof Split> = { "tach-van-don": Split, "dinh-danh": QrCode };
type T = (typeof FORM_MESSAGES)["vi"];
type Msg = keyof T;
/** Tên nút / tiêu đề / mô tả nghiệp vụ theo ngôn ngữ (bản vi trùng chữ trong @kb/contracts transport-operations). `edaMenu`: tên nút ở tờ khai xuất. */
const OP_TEXT = {
  "tach-van-don": { menu: "opSplitMenu", title: "opSplitMenu", description: "opSplitDesc" },
  "dinh-danh": { menu: "opIdentMenu", edaMenu: "opExportIdentMenu", title: "opIdentTitle", description: "opIdentDesc" },
} as const satisfies Record<TransportOperationForm["id"], { menu: Msg; edaMenu?: Msg; title: Msg; description: Msg }>;
const opText = (t: T, kind: Kind, id: TransportOperationForm["id"]) => {
  const k: { menu: Msg; edaMenu?: Msg; title: Msg; description: Msg } = OP_TEXT[id];
  return { menu: t[kind === "EDA" && k.edaMenu ? k.edaMenu : k.menu], title: t[k.title], description: t[k.description] };
};

function OperationDialog({ form, kind, header, stage, showInapplicable, prototype, onClose }: { form: TransportOperationForm; kind: Kind; header: FormValues; stage: Stage; showInapplicable: boolean; prototype: boolean; onClose: () => void }) {
  const t = useMessages(FORM_MESSAGES);
  const [values, setValues] = useState<FormValues>(() => operationValues(form, kind, header, stage));
  const ctx = conditionContext(kind, values);
  const Icon = ICON[form.id];
  const text = opText(t, kind, form.id);
  const notConnected = (what: string) => toast({ tone: "info", title: prototype ? t.prototypeNotConnected : t.operationNotConnected, description: `${what} (${form.api.request} / ${form.api.response})` });
  return (
    <DialogContent title={text.title} icon={<Icon className="h-4 w-4" />} description={text.description} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          notConnected(fill(t.sendWhat, { what: text.title.toLowerCase() }));
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
          <Button type="button" variant="ghost" onClick={onClose}>{t.close}</Button>
          <Button type="button" variant="secondary" onClick={() => notConnected(t.askResult)}>{t.askResult}</Button>
          <Button type="submit">{t.sendDecl}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** `prototype` = trang Bản mẫu (gửi báo "bản mẫu"); false = hồ sơ thật (panel ô vận đơn của bản in) – gửi báo chưa kết nối nghiệp vụ với Hải quan. */
export function TransportOperationsBar({ kind, header, stage, amending, showInapplicable, prototype = true }: { kind: Kind; header: FormValues; stage: Stage; amending: boolean; showInapplicable: boolean; prototype?: boolean }) {
  const t = useMessages(FORM_MESSAGES);
  const [open, setOpen] = useState<TransportOperationForm["id"] | null>(null);
  const forms = operationsFor(kind, amending);
  const current = forms.find((f) => f.id === open);
  return (
    <div className="flex flex-wrap gap-2">
      {forms.map((f) => {
        const Icon = ICON[f.id];
        return (
          <Button key={f.id} variant="secondary" leftIcon={<Icon className="h-4 w-4" />} onClick={() => setOpen(f.id)}>
            {opText(t, kind, f.id).menu}
          </Button>
        );
      })}
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)} defaultPresentation="panel">
        {current && <OperationDialog key={current.id} form={current} kind={kind} header={header} stage={stage} showInapplicable={showInapplicable} prototype={prototype} onClose={() => setOpen(null)} />}
      </Dialog>
    </div>
  );
}
