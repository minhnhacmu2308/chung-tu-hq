"use client";
// Bước ③ Lý do & phê duyệt: hiện sẵn Mã lý do (bắt buộc) + Ghi chú sau + tóm tắt thay đổi; các ô còn lại của đầu bản khai trong "Thông tin khác"
// (đóng sẵn, tự mở khi thiếu ô bắt buộc). Ô khóa theo tờ khai gốc không hiện ở đây – đã có ở dòng tóm tắt đầu bước 7.
import { Alert, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, Disclosure, Field, Select, Stack, toast } from "@kb/ui";
import { processingContractNote } from "@kb/contracts";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Save, ShieldCheck, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { approvePostAmendment, updatePostAmendmentField } from "@/api/post-amendment";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { AmendLockProvider, type FieldLockLookup } from "../declaration-form/amend-context";
import { BlockView } from "../declaration-form/block-view";
import { conditionContext, type FormValues } from "../declaration-form/form-state";
import { ViewPrefsProvider } from "../declaration-form/view-prefs";
import { StickyActionBar } from "../dossier-detail/steps/declaration-parts";
import type { AmaStepCtx } from "./ama-context";
import { amaChangeSummary, approveBlockers, missingOther, reasonLayout } from "./ama-wizard";

const LAYOUT = reasonLayout();
const signed = (v: string) => `${v.startsWith("-") ? "−" : "+"}${formatMoney(v.replace("-", ""), "VND", 0)}`;

export function ReasonApprove({ ctx }: { ctx: AmaStepCtx }) {
  const { a, editable } = ctx;
  const saved = useMemo<FormValues>(() => a.header, [a]);
  const [draft, setDraft] = useState<FormValues>(saved);
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setDraft(saved);
  }, [savedKey]);
  const [approveOpen, setApproveOpen] = useState(false);

  const pending = editable ? Object.keys(draft).filter((k) => (draft[k] ?? "") !== (saved[k] ?? "")) : [];
  const summary = amaChangeSummary(a);
  const blockers = approveBlockers({ ...a, header: draft }, { pendingEdits: pending.length, fourEyes: ctx.fourEyes });
  const missing = missingOther(draft);
  const lock: FieldLockLookup = () => (editable ? null : { basis: "SOFTWARE", reason: "" });
  const onChange = editable ? (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v })) : undefined;

  const save = useMutation({
    mutationFn: async (keys: string[]) => {
      for (const key of keys) await updatePostAmendmentField(ctx.dossierId, { key, value: draft[key] ?? "" });
    },
    onSuccess: (_d, keys) => toast({ tone: "success", title: `Đã lưu ${formatNumber(keys.length)} chỉ tiêu` }),
    onError: toastMutationError("Không lưu được bản khai bổ sung"),
    onSettled: ctx.refresh,
  });
  const approve = useMutation({
    mutationFn: () => approvePostAmendment(ctx.dossierId),
    onSuccess: () => {
      setApproveOpen(false);
      toast({ tone: "success", title: "Đã phê duyệt bản khai bổ sung", description: "Bước tiếp theo: ký số và khai tạm AMA." });
      ctx.refresh();
      ctx.goSub("declare");
    },
    onError: toastMutationError("Không phê duyệt được bản khai bổ sung"),
  });

  const approved = a.status === "APPROVED";
  const block = (b: (typeof LAYOUT.other)[number] | typeof LAYOUT.main) => (
    <BlockView key={b.id} kind={ctx.kind} block={b} values={draft} onChange={onChange} ctx={conditionContext(ctx.kind, draft)} showInapplicable={false} showActions={false} />
  );

  return (
    <ViewPrefsProvider>
      <AmendLockProvider kind={ctx.kind} values={draft} active={false} override={lock}>
        <Stack gap="md">
          {approved && (
            <Alert tone="success" title="Đã phê duyệt">
              {a.approvedBy ? `${a.approvedBy} phê duyệt${a.approvedAt ? ` lúc ${formatDateTime(a.approvedAt)}` : ""}. ` : ""}Sửa tiếp thì phải phê duyệt lại.
            </Alert>
          )}
          <Card>
            <CardContent className="@container flex flex-col gap-3 pt-5">
              {block(LAYOUT.main)}
              <p className="text-sm text-fg-muted">
                Tóm tắt: {formatNumber(summary.lines)} dòng · {formatNumber(summary.changed)} chỉ tiêu đổi · Thuế <span className="font-medium tabular-nums text-fg">{signed(summary.taxDelta)}</span>
              </p>
            </CardContent>
          </Card>

          <Disclosure title="Thông tin khác (không bắt buộc)" defaultOpen={missing.length > 0} meta={missing.length > 0 ? <span className="text-warning-subtle-fg">thiếu {formatNumber(missing.length)} ô</span> : "nộp thuế, ngân hàng, bảo lãnh, tỷ giá, người khai"}>
            <div className="@container flex min-w-0 flex-col gap-3">
              {missing.length > 0 && <Alert tone="warning" title="Còn ô bắt buộc trống">{missing.map((f) => f.label).join(", ")}.</Alert>}
              {LAYOUT.other.map(block)}
              {editable && ctx.view.contracts.length > 0 && (
                <Field label="Hợp đồng gia công" hint="Chọn để chèn số và ngày hợp đồng vào ghi chú sau khai bổ sung">
                  <Select
                    className="cq-sm:w-72"
                    placeholder="Chọn hợp đồng…"
                    options={ctx.view.contracts.map((c) => ({ value: c.no, label: c.date ? `${c.no} · ${formatDate(c.date)}` : c.no }))}
                    value={draft["APP_HD_GC"] ?? ""}
                    onChange={(e) => {
                      const no = e.currentTarget.value;
                      const c = ctx.view.contracts.find((x) => x.no === no);
                      setDraft((d) => {
                        const note = c ? processingContractNote(c.no, c.date) : "";
                        const current = d["TK_NTA"] ?? "";
                        return { ...d, APP_HD_GC: no, ...(note && !current.includes(note) ? { TK_NTA: current.trim() ? `${current.trim()}\n${note}` : note } : {}) };
                      });
                    }}
                  />
                </Field>
              )}
            </div>
          </Disclosure>
        </Stack>
      </AmendLockProvider>

      <StickyActionBar>
        <div className="min-w-0 flex-1 basis-48">
          {pending.length > 0 ? (
            <p className="text-sm font-medium text-warning-subtle-fg">{formatNumber(pending.length)} chỉ tiêu chưa lưu</p>
          ) : editable && blockers.length > 0 ? (
            <p className="text-sm text-fg-muted">{blockers[0]}</p>
          ) : (
            <p className="text-sm text-fg-muted">{approved ? "Bản khai đã phê duyệt" : "Sẵn sàng phê duyệt"}</p>
          )}
        </div>
        {pending.length > 0 ? (
          <>
            <Button variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} disabled={save.isPending} onClick={() => setDraft(saved)}>
              Hoàn tác
            </Button>
            <Button leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(pending)}>
              Lưu {formatNumber(pending.length)} thay đổi
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => ctx.goSub("edit")}>
              Quay lại
            </Button>
            {approved || !editable ? (
              <Button rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => ctx.goSub("declare")} disabled={!approved && a.status === "DRAFT"}>
                Tiếp: khai Hải quan
              </Button>
            ) : (
              <Button leftIcon={<ShieldCheck className="h-4 w-4" />} disabled={blockers.length > 0} onClick={() => setApproveOpen(true)}>
                Phê duyệt
              </Button>
            )}
          </>
        )}
      </StickyActionBar>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent title="Phê duyệt bản khai bổ sung" icon={<ShieldCheck className="h-4 w-4" />} description={`Lần ${a.seq} · ${formatNumber(a.lines.length)} dòng hàng`} size="sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              approve.mutate();
            }}
          >
            <p className="text-sm text-fg-muted">Sau khi phê duyệt, bản khai được khóa để khai tạm AMA. Sửa tiếp phải phê duyệt lại. Hạn khai bổ sung: 60 ngày kể từ ngày thông quan (TT121 Điều 20).</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setApproveOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" loading={approve.isPending}>
                Phê duyệt
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ViewPrefsProvider>
  );
}
