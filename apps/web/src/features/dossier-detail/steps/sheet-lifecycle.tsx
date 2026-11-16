"use client";
// Trạng thái 3 nhóm của một tờ (khai báo · luồng · thông quan) và hộp "Xác nhận tờ khai đã hủy" (spec trang-thai-ho-so §4.3, §5, §6).
import { sheetStatusOf, type BranchSubmission } from "@kb/contracts";
import { Alert, Button, dateToIso, DatePicker, Dialog, DialogContent, DialogFooter, Field, fill, Input, Select, Stack, StatusBadge, Textarea, useMessages } from "@kb/ui";
import { Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { useCodeList, useCodeListState } from "../../declaration-form/use-code-list";
import { PROGRESS_STATUS } from "../../dossiers/dossier-progress-badge";
import { SHEET_LIFECYCLE_MESSAGES } from "./sheet-lifecycle.messages";

const CHANNEL = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const;

/** Nhóm 1 khai báo · nhóm 2 luồng · nhóm 3 thông quan của tờ (mỗi nhóm một nhãn). */
export function SheetStatusBadges({ sheet }: { sheet: Pick<BranchSubmission, "no" | "stage" | "state" | "channel" | "amendments" | "postAmendments"> }) {
  const t = useMessages(SHEET_LIFECYCLE_MESSAGES);
  const st = sheetStatusOf(sheet);
  return (
    <>
      <StatusBadge status={PROGRESS_STATUS[st.declaration]} />
      {st.channel && <StatusBadge status={CHANNEL[st.channel]} />}
      {st.cleared && <StatusBadge status="DOSSIER_CLEARED" label={t.cleared} />}
    </>
  );
}

export type Cancellation = NonNullable<BranchSubmission["cancellation"]>;

/** Mã lý do hủy + tên trong danh mục CANCEL_REASON (tên pháp lý – không dịch); danh mục chưa tải / mã lạ → chỉ mã. */
export function useCancelReasonText(code: string | undefined): string {
  const list = useCodeList(code ? "CANCEL_REASON" : undefined);
  if (!code) return "";
  const name = list?.find((r) => r.code === code)?.name;
  return name ? `${code} – ${name}` : code;
}

/** Một dòng thông tin hủy (thay mô tả giai đoạn "Đã hủy" dưới tiêu đề thẻ): ngày · lý do · số văn bản. */
export function CancellationLine({ cancellation }: { cancellation: Cancellation }) {
  const t = useMessages(SHEET_LIFECYCLE_MESSAGES);
  const reason = useCancelReasonText(cancellation.reason);
  const parts = [
    fill(t.infoCancelledOn, { date: formatDate(cancellation.date) }),
    fill(t.infoReason, { reason }),
    ...(cancellation.docNo ? [fill(t.infoDocNo, { docNo: cancellation.docNo })] : []),
  ];
  return <>{parts.join(" · ")}</>;
}

export type CancelInput = { reason: string; date: string; docNo?: string; note?: string };

/** Ngày nghiệp vụ hôm nay theo giờ máy (không dùng UTC: 0–7 giờ sáng ở VN sẽ ra hôm qua). */
const today = () => dateToIso(new Date());

/**
 * Ghi nhận Hải quan đã hủy tờ khai. Dùng Dialog + form (không phải ConfirmDialog): ConfirmDialog bọc children trong Alert nên không chứa được ô nhập.
 * Mỗi lần mở là một form trống (đổi tờ cũng vậy).
 */
/** Lý do (CANCEL_REASON), ngày (mặc định hôm nay), số văn bản và ghi chú tùy chọn. */
export function CancelDeclarationDialog({ description, open, onOpenChange, pending, onConfirm }: {
  description: string; open: boolean; onOpenChange: (o: boolean) => void; pending: boolean; onConfirm: (i: CancelInput) => void;
}) {
  const t = useMessages(SHEET_LIFECYCLE_MESSAGES);
  const { state, retry } = useCodeListState("CANCEL_REASON");
  const reasons = state?.status === "ready" ? state.list : null;
  const failed = state?.status === "error";
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today);
  const [docNo, setDocNo] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setReason("");
    setDate(today());
    setDocNo("");
    setNote("");
  }, [open, description]);
  return (
    <Dialog open={open} onOpenChange={(o) => (o || !pending) && onOpenChange(o)}>
      <DialogContent title={t.cancelTitle} icon={<Ban className="h-4 w-4" />} tone="danger" description={description} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reason && date) onConfirm({ reason, date, ...(docNo.trim() ? { docNo: docNo.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
          }}
        >
          <Stack gap="md">
            <Alert tone="danger" title={t.cancelIrreversible} />
            {failed && (
              <Alert tone="danger" title={t.cancelCodesError} action={<Button size="sm" variant="secondary" type="button" onClick={retry}>{t.cancelCodesRetry}</Button>} />
            )}
            <Field label={t.cancelReason} required {...(reasons || failed ? {} : { hint: t.cancelCodesLoading })}>
              <Select
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
                placeholder={t.cancelReasonPlaceholder}
                disabled={!reasons}
                options={(reasons ?? []).filter((r) => !r.inactive).map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))}
              />
            </Field>
            <Field label={t.cancelDate} required>
              <DatePicker value={date} onChange={(v) => setDate(v ?? "")} />
            </Field>
            <Field label={t.cancelDocNo}>
              <Input value={docNo} onChange={(e) => setDocNo(e.currentTarget.value)} placeholder={t.cancelDocNoPlaceholder} maxLength={100} />
            </Field>
            <Field label={t.cancelNote}>
              <Textarea value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder={t.cancelNotePlaceholder} maxLength={1000} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button variant="secondary" type="button" disabled={pending} onClick={() => onOpenChange(false)}>
              {t.cancelKeep}
            </Button>
            <Button variant="danger" type="submit" loading={pending} disabled={!reason || !date}>
              {t.cancelAction}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
