"use client";
// Panel chi tiết một dòng hàng của bản khai bổ sung AMA (ảnh "CHI TIẾT HÀNG HÓA"): mô tả, xuất xứ, mã hàng; khối Thuế nhập khẩu và xuất khẩu,
// khối Thuế và thu khác 1–5 – mỗi khối hàng Trước (theo tờ khai gốc, chỉ đọc) và hàng Sau (sửa được, tiền thuế tự tính lại).
import { Alert, Button, Dialog, DialogContent, Stack, toast } from "@kb/ui";
import {
  AMA_COMPUTED_KEYS, AMA_IMPORT_TAX_BLOCK, AMA_LINE_LAYOUT, AMA_OTHER_TAX_SLOTS, amaLineLocked, amaOtherTaxBlock, amaOtherTaxColumns, applyAmaLineEdit,
  LINE_LOCK_REASON, type LayoutBlock, type PostAmendmentLine,
} from "@kb/contracts";
import { useMutation } from "@tanstack/react-query";
import { Calculator, Package, Plus, Save, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { updatePostAmendmentField } from "@/api/post-amendment";
import { formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { AmendLockProvider, type FieldLockLookup } from "../declaration-form/amend-context";
import { BlockView } from "../declaration-form/block-view";
import { conditionContext } from "../declaration-form/form-state";

type Props = {
  kind: "IDA" | "EDA";
  line: PostAmendmentLine | null;
  editable: boolean;
  dossierId: string;
  onClose: () => void;
  onSaved: () => void;
};

const hasAny = (values: Record<string, string>, n: number) => amaOtherTaxColumns(n).some((c) => values[c.before]?.trim() || values[c.after]?.trim());
const LABEL: Record<string, string> = Object.fromEntries([
  ["HAG_AKA", "Số tiền thuế XNK"],
  ...AMA_OTHER_TAX_SLOTS.flatMap((n) => [[`HAG_AB${n}`, `Trị giá tính thu khác ${n}`], [`HAG_AA${n}`, `Số tiền thu khác ${n}`]]),
]);

export function AmaLinePanel({ kind, line, editable, dossierId, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<PostAmendmentLine | null>(line);
  const [edited, setEdited] = useState<string[]>([]);
  const [slots, setSlots] = useState(1);
  const lineKey = line ? `${line.id}:${JSON.stringify(line.values)}:${line.manual.join(",")}` : "";
  useEffect(() => {
    setDraft(line);
    setEdited([]);
    setSlots(line ? Math.max(1, ...AMA_OTHER_TAX_SLOTS.filter((n) => hasAny(line.values, n))) : 1);
  }, [lineKey]);

  const save = useMutation({
    mutationFn: async (keys: string[]) => {
      if (!draft) return;
      for (const key of keys) await updatePostAmendmentField(dossierId, { lineId: draft.id, key, value: draft.values[key] ?? "" });
    },
    onSuccess: (_d, keys) => toast({ tone: "success", title: `Đã lưu ${formatNumber(keys.length)} chỉ tiêu của dòng` }),
    onError: toastMutationError("Không lưu được dòng hàng"),
    onSettled: onSaved,
  });

  const lock: FieldLockLookup = (key) => (!editable ? { basis: "SOFTWARE", reason: "" } : amaLineLocked(key) ? { basis: "SOFTWARE", reason: key === "HAG_RAN" || key.startsWith("HAG_C") || key.startsWith("HAG_OR") ? LINE_LOCK_REASON : "" } : null);
  const change = (key: string, value: string) => {
    setDraft((d) => (d ? applyAmaLineEdit(d, key, value) : d));
    setEdited((e) => (e.includes(key) ? e : [...e, key]));
  };
  const v = draft?.values ?? {};
  const blocks: LayoutBlock[] = [
    ...AMA_LINE_LAYOUT,
    AMA_IMPORT_TAX_BLOCK,
    ...AMA_OTHER_TAX_SLOTS.filter((n) => n <= slots || hasAny(v, n)).map(amaOtherTaxBlock),
  ];
  const manual = (draft?.manual ?? []).filter((k) => AMA_COMPUTED_KEYS.has(k));

  return (
    <Dialog open={Boolean(line && draft)} onOpenChange={(o) => !o && onClose()} defaultPresentation="panel">
      {line && draft && (
        <DialogContent
          title={`Dòng ${v["HAG_RAN"] ?? line.ran} trên tờ khai gốc`}
          icon={<Package className="h-4 w-4" />}
          description="Trước: theo tờ khai gốc và số Hải quan trả về (chỉ đọc). Sau: nội dung khai bổ sung – tiền thuế tự tính lại theo trị giá và thuế suất."
          size="lg"
        >
          <AmendLockProvider kind={kind} values={v} active={false} override={lock}>
            <Stack gap="md">
              {edited.length > 0 && (
                <Alert tone="warning" title={`Có ${formatNumber(edited.length)} chỉ tiêu chưa lưu`}>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(edited)}>
                      Lưu {formatNumber(edited.length)} thay đổi
                    </Button>
                    <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} disabled={save.isPending} onClick={() => { setDraft(line); setEdited([]); }}>
                      Hoàn tác
                    </Button>
                  </div>
                </Alert>
              )}
              {manual.length > 0 && (
                <Alert tone="info" title="Có số tiền đã sửa tay – không tự tính lại">
                  <div className="flex flex-wrap gap-2 pt-1">
                    {manual.map((k) => (
                      <Button key={k} size="sm" variant="secondary" leftIcon={<Calculator className="h-4 w-4" />} disabled={!editable} onClick={() => change(k, "")}>
                        Tự tính lại: {LABEL[k] ?? k}
                      </Button>
                    ))}
                  </div>
                </Alert>
              )}
              {blocks.map((b) => (
                <BlockView key={b.id} kind={kind} block={b} values={v} onChange={editable ? change : undefined} ctx={conditionContext(kind, v)} showInapplicable={false} />
              ))}
              {editable && slots < AMA_OTHER_TAX_SLOTS.length && (
                <div>
                  <Button size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setSlots((s) => s + 1)}>
                    Thêm thuế và thu khác
                  </Button>
                </div>
              )}
            </Stack>
          </AmendLockProvider>
        </DialogContent>
      )}
    </Dialog>
  );
}
