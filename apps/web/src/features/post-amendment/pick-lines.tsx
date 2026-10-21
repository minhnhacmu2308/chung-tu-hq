"use client";
// Bước ① Chọn dòng: tick các dòng của tờ khai gốc cần khai bổ sung (AMA sửa được nhiều dòng cùng lúc). Dòng đã có trong bản khai tick sẵn, khóa –
// bỏ dòng làm ở bước ②.
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, EmptyState, fill, useMessages } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, FileX2 } from "lucide-react";
import { useState } from "react";
import { addPostAmendmentLines } from "@/api/post-amendment";
import { formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { StickyActionBar } from "../dossier-detail/steps/declaration-parts";
import type { AmaStepCtx } from "./ama-context";
import { AMA_MESSAGES } from "./ama.messages";

export function PickLines({ ctx }: { ctx: AmaStepCtx }) {
  const { a, view, editable } = ctx;
  const t = useMessages(AMA_MESSAGES);
  const used = new Set(a.lines.map((l) => l.ran));
  const [picked, setPicked] = useState<number[]>([]);
  const free = view.sourceLines.filter((s) => !used.has(s.lineNo));
  const add = useMutation({
    mutationFn: () => addPostAmendmentLines(ctx.dossierId, [...picked].sort((x, y) => x - y)),
    onSuccess: () => {
      ctx.refresh();
      ctx.goSub("edit");
    },
    onError: toastMutationError(t.addFailed),
  });

  const total = used.size + picked.length;
  const all = free.length > 0 && picked.length === free.length;
  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const next = () => (picked.length ? add.mutate() : ctx.goSub("edit"));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h3">{t.pickTitle}</CardTitle>
          <CardDescription>{t.pickDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {view.sourceLines.length === 0 ? (
            <EmptyState icon={<FileX2 />} title={t.noSourceLines} />
          ) : (
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="sr-only">{t.sourceLegend}</legend>
              {editable && free.length > 1 && (
                <Checkbox label={fill(t.selectAll, { n: formatNumber(free.length) })} checked={all} onChange={() => setPicked(all ? [] : free.map((o) => o.lineNo))} />
              )}
              {view.sourceLines.map((o) => {
                const inAma = used.has(o.lineNo);
                return (
                  <Checkbox
                    key={o.lineNo}
                    checked={inAma || picked.includes(o.lineNo)}
                    disabled={inAma || !editable}
                    onChange={() => toggle(o.lineNo)}
                    label={
                      <span className="flex min-w-0 flex-col">
                        <span>
                          {fill(t.lineHs, { n: o.lineNo, hs: o.hsCode || "—" })}
                          {inAma && <span className="text-fg-muted">{t.inAma}</span>}
                        </span>
                        <span className="text-xs text-fg-muted">{o.description}</span>
                      </span>
                    }
                  />
                );
              })}
            </fieldset>
          )}
        </CardContent>
      </Card>
      <StickyActionBar>
        <p className="min-w-0 flex-1 basis-40 text-sm font-medium text-fg">{fill(t.pickedN, { n: formatNumber(total) })}</p>
        {editable ? (
          <Button rightIcon={<ArrowRight className="h-4 w-4" />} disabled={total === 0} loading={add.isPending} onClick={next}>
            {fill(t.nextEdit, { n: formatNumber(total) })}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => ctx.goSub("edit")}>{t.viewEdit}</Button>
        )}
      </StickyActionBar>
    </>
  );
}
