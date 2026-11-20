"use client";
// Hộp thoại "Đăng ký số định danh": số lượng (1–50) + ô khai như panel Khai báo định danh (cùng khối IDENTIFIER_FORM, điền sẵn từ lần gửi trước).
// `clientKey` sinh một lần khi mở – bấm Gửi lại / mạng gửi lặp vẫn chỉ một lô. Gửi xong đóng ngay, kết quả tự cập nhật ở danh sách.
import { IDENTIFIER_FORM, type IdentifierRequest } from "@kb/contracts";
import { Alert, Button, DialogContent, DialogFooter, Field, fill, Input, Stack, toast, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { useState } from "react";
import { customsOpsKeys, requestIdentifierBatch } from "@/api/customs-ops";
import { toastMutationError } from "@/lib/mutation-error";
import { BlockView } from "../declaration-form/block-view";
import { conditionContext, type FormValues } from "../declaration-form/form-state";
import { identifierRequestOf, labelOf, REQUEST_KEYS, requestValues } from "../declaration-form/identifier-dialog";
import { IDENTIFIER_BATCH_MESSAGES } from "./customs-ops.messages";

const MAX = 50;
const DEFAULTS: FormValues = { LOAI_DT: "1", LOAI_HH: "1" };

type Props = { lastRequest: IdentifierRequest | null; onClose: () => void };

export function IdentifierBatchDialog({ lastRequest, onClose }: Props) {
  const m = useMessages(IDENTIFIER_BATCH_MESSAGES);
  const qc = useQueryClient();
  const [clientKey] = useState(() => crypto.randomUUID());
  const [count, setCount] = useState("1");
  const [countError, setCountError] = useState(false);
  const [values, setValues] = useState<FormValues>(() => ({ ...DEFAULTS, ...(lastRequest ? requestValues(lastRequest) : {}) }));
  const [missing, setMissing] = useState<string[]>([]);

  const send = useMutation({
    mutationFn: requestIdentifierBatch,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: customsOpsKeys.all });
      toast({ tone: "success", title: fill(m.sent, { n: res.ids.length }), description: m.sentHint });
      onClose();
    },
    onError: toastMutationError(m.sendFailed),
  });

  const submit = () => {
    const n = Number(count);
    const badCount = !Number.isInteger(n) || n < 1 || n > MAX;
    setCountError(badCount);
    const parsed = identifierRequestOf(values);
    setMissing(parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => REQUEST_KEYS[i.path[0] as keyof IdentifierRequest]).filter(Boolean))].map((k) => labelOf(IDENTIFIER_FORM.blocks, k)));
    if (badCount || !parsed.success) return;
    send.mutate({ clientKey, count: n, request: parsed.data });
  };

  const ctx = conditionContext("IDA", values);
  return (
    <DialogContent title={m.title} icon={<QrCode className="h-4 w-4" />} description={m.description} size="lg">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Stack gap="md">
          {missing.length > 0 && <Alert tone="danger" title={m.missingTitle}>{fill(m.missing, { fields: missing.join(", ") })}</Alert>}
          <Field label={m.count} hint={m.countHint} required {...(countError ? { error: m.countError } : {})} className="cq-md:max-w-xs">
            <Input type="number" inputMode="numeric" min={1} max={MAX} step={1} value={count} placeholder={m.countPlaceholder} onChange={(e) => setCount(e.target.value)} />
          </Field>
          {IDENTIFIER_FORM.blocks.map((b) => (
            <BlockView key={b.id} kind="IDA" block={b} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} ctx={ctx} showInapplicable={false} />
          ))}
        </Stack>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{m.cancel}</Button>
          <Button type="submit" loading={send.isPending}>{m.submit}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
