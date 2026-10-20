"use client";
// Bước ① Chọn dòng: tick các dòng của tờ khai gốc cần khai bổ sung (AMA sửa được nhiều dòng cùng lúc). Dòng đã có trong bản khai tick sẵn, khóa –
// bỏ dòng làm ở bước ②.
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, EmptyState } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, FileX2 } from "lucide-react";
import { useState } from "react";
import { addPostAmendmentLines } from "@/api/post-amendment";
import { formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { StickyActionBar } from "../dossier-detail/steps/declaration-parts";
import type { AmaStepCtx } from "./ama-context";

export function PickLines({ ctx }: { ctx: AmaStepCtx }) {
  const { a, view, editable } = ctx;
  const used = new Set(a.lines.map((l) => l.ran));
  const [picked, setPicked] = useState<number[]>([]);
  const free = view.sourceLines.filter((s) => !used.has(s.lineNo));
  const add = useMutation({
    mutationFn: () => addPostAmendmentLines(ctx.dossierId, [...picked].sort((x, y) => x - y)),
    onSuccess: () => {
      ctx.refresh();
      ctx.goSub("edit");
    },
    onError: toastMutationError("Không thêm được dòng hàng"),
  });

  const total = used.size + picked.length;
  const all = free.length > 0 && picked.length === free.length;
  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const next = () => (picked.length ? add.mutate() : ctx.goSub("edit"));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h3">Chọn dòng hàng cần sửa</CardTitle>
          <CardDescription>Chỉ chọn dòng có thay đổi. Phần Trước lấy theo tờ khai gốc và số Hải quan trả về; phần Sau ban đầu bằng Trước.</CardDescription>
        </CardHeader>
        <CardContent>
          {view.sourceLines.length === 0 ? (
            <EmptyState icon={<FileX2 />} title="Tờ khai gốc chưa có dòng hàng" />
          ) : (
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="sr-only">Dòng hàng trên tờ khai gốc</legend>
              {editable && free.length > 1 && (
                <Checkbox label={`Chọn tất cả (${formatNumber(free.length)} dòng chưa chọn)`} checked={all} onChange={() => setPicked(all ? [] : free.map((o) => o.lineNo))} />
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
                          Dòng {o.lineNo} · HS {o.hsCode || "—"}
                          {inAma && <span className="text-fg-muted"> · đã có trong bản khai</span>}
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
        <p className="min-w-0 flex-1 basis-40 text-sm font-medium text-fg">Đã chọn {formatNumber(total)} dòng</p>
        {editable ? (
          <Button rightIcon={<ArrowRight className="h-4 w-4" />} disabled={total === 0} loading={add.isPending} onClick={next}>
            Tiếp: sửa nội dung ({formatNumber(total)} dòng)
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => ctx.goSub("edit")}>Xem nội dung sửa</Button>
        )}
      </StickyActionBar>
    </>
  );
}
