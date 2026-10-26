"use client";
// Thẻ "Hồ sơ đính kèm (HYS)" ở bước Khai báo Hải quan (spec §3.1): gợi ý chưa khai + nút "Khai HYS", danh sách bộ (trạng thái,
// số tiếp nhận, kết quả điền 1.63/2.53), bộ bị từ chối / lỗi gửi, nhắc khai bổ sung khi luồng vàng/đỏ. Mở form HYS (panel).
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, fill, formatBytes, SkeletonList, Stack, StatusBadge, useMessages, useUiLocale,
} from "@kb/ui";
import type { HysProcedureCode, HysSubmissionView } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { dossierKeys, listDocuments } from "@/api/dossiers";
import { createHys, getHysOverview, hysKeys } from "@/api/hys";
import { LoadError } from "@/components/common/load-error";
import { formatDate } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { HysForm, hysEditable, putHysSubmission } from "./hys-form";
import { useRuleText } from "./hys-suggest-dialog";
import { HYS_MESSAGES, HYS_PROCEDURE_MESSAGES } from "./hys.messages";

const HYS_STATUS = {
  DRAFT: "HYS_DRAFT", SENDING: "HYS_SENDING", ACCEPTED: "HYS_ACCEPTED", REJECTED: "HYS_REJECTED", SEND_FAILED: "HYS_SEND_FAILED",
} as const satisfies Record<HysSubmissionView["status"], string>;

/** Ô "Số đính kèm khai báo điện tử": 1.63 (IDA) / 2.53 (EDA). */
export const attachmentFieldNo = (kind: "IDA" | "EDA") => (kind === "IDA" ? "1.63" : "2.53");

export type HysCardProps = {
  dossierId: string;
  kind: "IDA" | "EDA";
  /** Yêu cầu từ ngoài (hộp xác nhận khai IDA/EDA): mở form khai HYS với mã này. */
  startCode?: HysProcedureCode | null;
  onStartHandled?: () => void;
};

export function HysCard({ dossierId, kind, startCode = null, onStartHandled }: HysCardProps) {
  const t = useMessages(HYS_MESSAGES);
  const names = useMessages(HYS_PROCEDURE_MESSAGES);
  const ruleText = useRuleText();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: hysKeys.overview(dossierId), queryFn: () => getHysOverview(dossierId) });
  const docsQ = useQuery({ queryKey: dossierKeys.documents(dossierId), queryFn: () => listDocuments(dossierId) });
  const documents = (docsQ.data ?? []).filter((d) => d.status === "DONE");
  const [openId, setOpenId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (code: HysProcedureCode | null) => createHys(dossierId, code ? { procedureCode: code } : {}),
    onSuccess: (v) => {
      putHysSubmission(qc, dossierId, v);
      setOpenId(v.id);
    },
    onError: toastMutationError(t.createFailed),
  });

  /** Khai HYS theo mã: còn bộ cùng mã đang soạn thì mở lại, không thì tạo bộ mới. */
  const declare = (code: HysProcedureCode) => {
    const draft = q.data?.submissions.find((s) => s.procedureCode === code && hysEditable(s));
    if (draft) setOpenId(draft.id);
    else create.mutate(code);
  };

  useEffect(() => {
    if (!startCode || !q.data) return;
    declare(startCode);
    onStartHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCode, q.data]);

  const field = attachmentFieldNo(kind);
  const open = q.data?.submissions.find((s) => s.id === openId);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <CardTitle className="flex items-center gap-2">
            <Paperclip aria-hidden="true" className="h-5 w-5 text-primary" />
            {t.cardTitle}
          </CardTitle>
          <CardDescription>{fill(t.cardDesc, { op: kind, field })}</CardDescription>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} disabled={!q.data} loading={create.isPending && create.variables === null} onClick={() => create.mutate(null)}>
          {t.newSet}
        </Button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <SkeletonList rows={2} />
        ) : q.isError || !q.data ? (
          <LoadError title={t.loadError} onRetry={() => void q.refetch()} />
        ) : (
          <Stack gap="md">
            {q.data.supplementHint && (
              <Alert tone="info" title={t.supplementTitle}>
                {t.supplementBody}
              </Alert>
            )}
            {q.data.suggestions.length > 0 && (
              <section aria-label={t.suggestTitle} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-fg">{t.suggestTitle}</h3>
                <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                  {q.data.suggestions.map((s) => (
                    <li key={`${s.code}-${s.rule}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 cq-sm:min-w-56">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                          <Badge tone="warning" variant="outline" className="font-mono">
                            {s.code}
                          </Badge>
                          {names[s.code]}
                        </span>
                        <span className="text-sm text-fg-muted">{ruleText(s)}</span>
                      </div>
                      <Button
                        size="sm"
                        leftIcon={<Paperclip className="h-3.5 w-3.5" />}
                        loading={create.isPending && create.variables === s.code}
                        disabled={create.isPending}
                        onClick={() => declare(s.code)}
                        aria-label={fill(t.declareAria, { code: s.code })}
                      >
                        {t.declare}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {q.data.submissions.length === 0 ? (
              q.data.suggestions.length === 0 && <p className="text-sm text-fg-subtle">{t.empty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {q.data.submissions.map((s) => (
                  <SubmissionRow key={s.id} s={s} field={field} onOpen={() => setOpenId(s.id)} />
                ))}
              </ul>
            )}
          </Stack>
        )}
      </CardContent>
      {open && (
        <HysForm
          key={open.id}
          dossierId={dossierId}
          kind={kind}
          submission={open}
          documents={documents}
          open
          onOpenChange={(o) => !o && setOpenId(null)}
        />
      )}
    </Card>
  );
}

function SubmissionRow({ s, field, onOpen }: { s: HysSubmissionView; field: string; onOpen: () => void }) {
  const t = useMessages(HYS_MESSAGES);
  const names = useMessages(HYS_PROCEDURE_MESSAGES);
  const locale = useUiLocale();
  const size = s.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const code = s.procedureCode as HysProcedureCode | null;
  const fillKey = s.fill ? (`fill${s.fill.outcome}` as const) : null;
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 cq-sm:min-w-56">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-fg">{fill(t.setTitle, { seq: s.seq })}</span>
            {code ? (
              <Badge tone="neutral" variant="outline" className="font-mono">
                {code}
              </Badge>
            ) : null}
            <span className="text-sm text-fg">{code && code in names ? names[code] : t.noProcedure}</span>
            <StatusBadge status={HYS_STATUS[s.status]} />
          </div>
          <p className="text-sm text-fg-muted">{fill(t.filesInfo, { n: s.files.length, size: formatBytes(size, locale) })}</p>
          {s.receiptNo && (
            <p className="text-sm text-fg">
              {fill(t.receipt, { no: s.receiptNo, date: s.registeredOn ? formatDate(s.registeredOn) : "" })}
            </p>
          )}
          {s.fill && fillKey && (
            <p className={s.fill.outcome === "FILLED" || s.fill.outcome === "ALREADY" ? "text-sm text-fg-muted" : "text-sm text-warning-subtle-fg"}>
              {fill(t[fillKey], { field, slot: s.fill.slot ?? "", receipt: s.receiptNo ?? "" })}
              {s.fill.afterApproval && <> {t.afterApproval}</>}
            </p>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={onOpen} aria-label={fill(t.openAria, { seq: s.seq })}>
          {t.open}
        </Button>
      </div>
      {(s.status === "REJECTED" || s.status === "SEND_FAILED") && (
        <Alert tone="danger" title={fill(s.status === "REJECTED" ? t.rejectedTitle : t.sendFailedTitle, { seq: s.seq })}>
          <ul className="flex flex-col gap-1">
            {(s.reject ?? []).map((r, i) => (
              <li key={`${r.code}-${i}`}>
                <span className="font-mono">{r.code}</span> {r.message}
                {r.solution && <span className="block text-fg-muted">{fill(t.solution, { text: r.solution })}</span>}
              </li>
            ))}
          </ul>
          <p>{t.rejectedHint}</p>
        </Alert>
      )}
    </li>
  );
}
