"use client";
// Panel "Khai báo định danh" trên hồ sơ thật: Gửi khai báo → POST /dossiers/:id/identifier (worker gọi FPT V5IdentifierReq), kết quả Hải quan
// (số định danh, ngày, mã QR, trạng thái) tự cập nhật khi đang chờ; "Hỏi kết quả" hỏi V5IdentifierRes ngay. Ô khai điền sẵn từ tờ khai, lần sau
// điền lại từ lần gửi gần nhất. Bản mẫu (không có hồ sơ) vẫn dùng OperationDialog của transport-operations-bar.
import { IdentifierRequestSchema, type IdentifierRecord, type IdentifierRequest, type LayoutBlock, type TransportOperationForm } from "@kb/contracts";
import { hasSigningPortError, SigningPortAlert } from "../dossier-detail/steps/signing-port-alert";
import { Alert, Barcode, Button, Card, DialogContent, DialogFooter, fill, SkeletonCard, Stack, StatusBadge, toast, useMessages } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getIdentifier, identifierKeys, pollIdentifier, sendIdentifier, type IdentifierView } from "@/api/identifier";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatDateTime } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { BlockView } from "./block-view";
import { FORM_MESSAGES } from "./form.messages";
import { conditionContext, type FormValues } from "./form-state";
import { IDENTIFIER_MESSAGES } from "./identifier-dialog.messages";
import { operationValues } from "./transport-operations";

type Kind = "IDA" | "EDA";
const STATUS = { SENDING: "KVGS_SENDING", ACCEPTED: "KVGS_ACCEPTED", REJECTED: "KVGS_REJECTED", NO_RESPONSE: "KVGS_NO_RESPONSE" } as const satisfies Record<IdentifierRecord["status"], string>;
/** Đang chờ Hải quan → hỏi lại màn hình mỗi 3 giây (worker ghi kết quả). */
const REFRESH_MS = 3_000;

/** Ô của panel (tên chỉ tiêu FPT) ↔ trường yêu cầu gửi backend. */
const REQUEST_KEYS = {
  objectType: "LOAI_DT", goodsType: "LOAI_HH", customsOffice: "MA_HQ", taxCode: "MA_DV", companyName: "TEN_DV", agentTaxCode: "MA_DAI_LY", agentName: "TEN_DAI_LY", userId: "USER_ID",
} as const satisfies Record<keyof IdentifierRequest, string>;

/** Giá trị ô → yêu cầu; ô tùy chọn để trống thì bỏ. */
export function identifierRequestOf(values: FormValues) {
  const raw: Record<string, string> = {};
  for (const [k, key] of Object.entries(REQUEST_KEYS)) {
    const v = (values[key] ?? "").trim();
    if (v) raw[k] = v;
  }
  return IdentifierRequestSchema.safeParse(raw);
}

/** Lần gửi trước → ô khai (ô panel dùng tên chỉ tiêu FPT). */
export const requestValues = (r: IdentifierRequest): FormValues =>
  Object.fromEntries(Object.entries(REQUEST_KEYS).map(([k, key]) => [key, r[k as keyof IdentifierRequest] ?? ""]));

/** Kết quả Hải quan → giá trị theo tên chỉ tiêu FPT của khối kết quả (khung kết quả đọc nhãn từ @kb/contracts). */
export const resultValues = (r: IdentifierRecord | null): FormValues =>
  r
    ? {
        REF_ID: r.refId ?? "", SO_TN: r.receiptNo ?? "", NGAY_TN: r.receiptDate ?? "", NAM_TN: r.receiptDate?.slice(0, 4) ?? "", SO_DD: r.identifierNo ?? "",
        NGAY_DD: r.identifiedOn ?? "", TRANG_THAI: r.customsState ?? "", KET_QUA: r.resultText ?? "",
      }
    : {};

/** Tên chỉ tiêu của ô (tên pháp lý từ @kb/contracts – không dịch). */
const labelOf = (blocks: LayoutBlock[], key: string): string => {
  for (const b of blocks) for (const i of b.items) {
    if ("key" in i && i.key === key) return i.label;
    if ("fields" in i) for (const f of i.fields) if (f.key === key) return f.label;
  }
  return key;
};

/** Ô phụ của khung kết quả (theo thứ tự hiện); ngày ISO → định dạng theo ngôn ngữ. */
const DETAIL_KEYS = ["SO_TN", "NGAY_TN", "REF_ID", "KET_QUA"] as const;
const DATE_KEYS = new Set<string>(["NGAY_TN", "NGAY_DD"]);

/**
 * Khung kết quả gọn ở đầu panel: trạng thái + lần gửi; số định danh nổi bật (màu chính) cạnh mã QR; dưới là số tiếp nhận, ngày tiếp nhận,
 * số tham chiếu, câu Hải quan trả về (chỉ ô có giá trị).
 */
function IdentifierResult({ record, blocks }: { record: IdentifierRecord; blocks: LayoutBlock[] }) {
  const m = useMessages(IDENTIFIER_MESSAGES);
  const v = resultValues(record);
  const show = (k: string) => (DATE_KEYS.has(k) ? formatDate(v[k]!) : v[k]!);
  const details = DETAIL_KEYS.filter((k) => v[k]);
  return (
    <Card aria-label={m.resultTitle}>
      <Stack gap="sm" className="p-4">
        <Stack direction="row" gap="sm" align="center" wrap>
          <span className="text-sm font-semibold">{m.resultTitle}</span>
          <StatusBadge status={STATUS[record.status]} />
          <span className="text-sm text-fg-muted">
            {fill(m.attempt, { n: record.attempt })} · {formatDateTime(record.sentAt)}
          </span>
        </Stack>
        {record.identifierNo && (
          <Stack direction="row" gap="md" align="center" justify="between">
            <Stack gap="xs" className="min-w-0">
              <span className="text-sm text-fg-muted">{labelOf(blocks, "SO_DD")}</span>
              <span className="break-all text-2xl font-semibold tabular-nums text-primary">{record.identifierNo}</span>
              {record.identifiedOn && (
                <span className="text-sm text-fg-muted">
                  {labelOf(blocks, "NGAY_DD")}: {formatDate(record.identifiedOn)}
                </span>
              )}
            </Stack>
            {record.qrPng && <Barcode type="png" value={record.qrPng} size="md" surface="scan" label={fill(m.qrLabel, { no: record.identifierNo })} />}
          </Stack>
        )}
        {details.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-border pt-2 text-sm cq-sm:grid-cols-2">
            {details.map((k) => (
              <div key={k} className={k === "KET_QUA" || k === "REF_ID" ? "min-w-0 cq-sm:col-span-2" : "min-w-0"}>
                <dt className="inline text-fg-muted">{labelOf(blocks, k)}: </dt>
                <dd className="inline break-all">{show(k)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Stack>
    </Card>
  );
}

type Props = {
  form: TransportOperationForm; kind: Kind; header: FormValues; dossierId: string; showInapplicable: boolean; text: { title: string; description: string }; onClose: () => void;
  /** Xác nhận số định danh đã cấp → điền vào ô số vận đơn của tờ khai. Không truyền (chỉ xem) → không có nút Xác nhận. */
  onConfirm?: (identifierNo: string) => void;
};

export function IdentifierDialog({ form, kind, header, dossierId, showInapplicable, text, onClose, onConfirm }: Props) {
  const t = useMessages(FORM_MESSAGES);
  const m = useMessages(IDENTIFIER_MESSAGES);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: identifierKeys.detail(dossierId),
    queryFn: () => getIdentifier(dossierId),
    refetchInterval: (query) => (query.state.data?.latest?.status === "SENDING" ? REFRESH_MS : false),
  });
  const latest = q.data?.latest ?? null;
  const [values, setValues] = useState<FormValues>(() => operationValues(form, kind, header));
  const [missing, setMissing] = useState<string[]>([]);

  // Lần đầu có dữ liệu: điền ô khai từ lần gửi gần nhất (người khai sửa tiếp rồi gửi lại).
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !q.data) return;
    prefilled.current = true;
    if (q.data.latest) setValues((v) => ({ ...v, ...requestValues(q.data.latest!.request) }));
  }, [q.data]);

  // Báo khi kết quả về trong lúc panel đang mở (SENDING → ACCEPTED).
  const prevStatus = useRef<IdentifierRecord["status"] | null>(null);
  useEffect(() => {
    const status = latest?.status ?? null;
    if (prevStatus.current === "SENDING" && status === "ACCEPTED" && latest?.identifierNo) toast({ tone: "success", title: fill(m.acceptedToast, { no: latest.identifierNo }) });
    prevStatus.current = status;
  }, [latest, m.acceptedToast]);

  const onView = (view: IdentifierView) => qc.setQueryData(identifierKeys.detail(dossierId), view);
  const send = useMutation({
    mutationFn: (input: IdentifierRequest) => sendIdentifier(dossierId, input),
    onSuccess: (view) => {
      onView(view);
      toast({ tone: "info", title: m.sentToast });
    },
    onError: toastMutationError(m.sendFailed),
  });
  const poll = useMutation({
    mutationFn: () => pollIdentifier(dossierId),
    onSuccess: (view) => {
      onView(view);
      // Hải quan mới tiếp nhận (tranG_THAI 11…), chưa cấp số định danh → nói rõ để người khai hỏi lại sau.
      if (view.latest && !view.latest.identifierNo && (view.latest.status === "SENDING" || view.latest.status === "NO_RESPONSE")) {
        toast({ tone: "info", title: m.stillPendingToast, ...(view.latest.resultText ? { description: view.latest.resultText } : {}) });
      }
    },
    onError: toastMutationError(m.pollFailed),
  });

  const pending = latest?.status === "SENDING";
  /** Đã có REF_ID mà chưa có số định danh (mới cấp số tiếp nhận / Hải quan chưa xử lý xong) → được hỏi kết quả. */
  const canPoll = !!latest?.refId && !latest.identifierNo && (latest.status === "SENDING" || latest.status === "NO_RESPONSE");
  const receiptOnly = canPoll && !!latest?.receiptNo;
  /** Đã cấp số định danh → thay Gửi khai báo bằng Xác nhận (điền số vào ô số vận đơn); ô khai chỉ còn để xem. */
  const issued = latest?.status === "ACCEPTED" && latest.identifierNo ? latest.identifierNo : null;
  const ctx = conditionContext(kind, values);

  const submit = () => {
    const parsed = identifierRequestOf(values);
    if (!parsed.success) {
      const keys = [...new Set(parsed.error.issues.map((i) => REQUEST_KEYS[i.path[0] as keyof IdentifierRequest]).filter(Boolean))];
      setMissing(keys.map((k) => labelOf(form.blocks, k)));
      return;
    }
    setMissing([]);
    send.mutate(parsed.data);
  };
  const confirm = (no: string) => {
    onConfirm?.(no);
    toast({ tone: "success", title: fill(m.confirmedToast, { no }), description: m.confirmedHint });
    onClose();
  };

  return (
    <DialogContent title={text.title} icon={<QrCode className="h-4 w-4" />} description={text.description} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!issued) submit();
        }}
      >
        <Stack gap="md">
          {q.isError ? (
            <LoadError title={m.loadFailed} onRetry={() => void q.refetch()} />
          ) : q.isPending ? (
            <SkeletonCard lines={3} />
          ) : latest ? (
            <IdentifierResult record={latest} blocks={form.result} />
          ) : (
            q.isSuccess && <span className="text-sm text-fg-muted">{m.notSent}</span>
          )}
          {receiptOnly ? (
            <Alert tone={pending ? "info" : "warning"} title={fill(m.receiptOnlyTitle, { no: latest!.receiptNo! })}>{m.receiptOnly}</Alert>
          ) : (
            <>
              {pending && <Alert tone="info" title={m.sending} />}
              {latest?.status === "NO_RESPONSE" && <Alert tone="warning" title={m.noResponse} />}
            </>
          )}
          {latest?.status === "REJECTED" && hasSigningPortError(latest.errors) ? (
            <SigningPortAlert />
          ) : latest?.status === "REJECTED" &&
            (latest.errors.length ? latest.errors : [{ code: "", message: latest.resultText ?? "" }]).map((e, i) => (
              <Alert key={`${e.code}-${i}`} tone="danger" title={i === 0 ? m.rejectedTitle : e.code}>
                {[e.code, e.message].filter(Boolean).join(" · ")}
                {"solution" in e && e.solution ? ` → ${e.solution}` : ""}
              </Alert>
            ))}
          {missing.length > 0 && <Alert tone="danger" title={m.missingTitle}>{fill(m.missing, { fields: missing.join(", ") })}</Alert>}

          {form.blocks.map((b) => (
            <BlockView key={b.id} kind={kind} block={b} values={values} onChange={pending || issued ? undefined : (k, v) => setValues((s) => ({ ...s, [k]: v }))} ctx={ctx} showInapplicable={showInapplicable} />
          ))}
        </Stack>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t.close}</Button>
          {issued ? (
            onConfirm && (
              <Button type="button" leftIcon={<Check className="h-4 w-4" />} onClick={() => confirm(issued)}>
                {m.confirm}
              </Button>
            )
          ) : (
            <>
              {/* Đang chờ số định danh: Hỏi kết quả là việc chính (nút nổi bật), Gửi khai báo khóa; ngược lại Gửi khai báo là nút chính. */}
              <Button type="button" variant={canPoll ? "primary" : "secondary"} disabled={!canPoll} loading={poll.isPending} onClick={() => poll.mutate()}>
                {t.askResult}
              </Button>
              <Button type="submit" variant={canPoll ? "secondary" : "primary"} disabled={pending || q.isPending} loading={send.isPending}>{t.sendDecl}</Button>
            </>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
