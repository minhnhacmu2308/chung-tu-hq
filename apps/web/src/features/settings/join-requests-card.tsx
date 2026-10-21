"use client";
import { RejectJoinRequestInputSchema, type JoinRequest } from "@kb/contracts";
import {
  Alert, Avatar, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, Field, Stack, Textarea, fill, toast,
  useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { approveJoinRequest, listJoinRequests, rejectJoinRequest, settingsKeys } from "@/api/settings";
import { formatRelative } from "@/lib/format";
import { MEMBERS_TAB_MESSAGES } from "./members-tab.messages";

/** Hộp từ chối: lý do KHÔNG bắt buộc (≤ 500 ký tự), gửi kèm email cho người xin. */
export function RejectJoinRequestDialog({ request, onOpenChange }: { request: JoinRequest | null; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const t = useMessages(MEMBERS_TAB_MESSAGES);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = request !== null;
  // Mỗi lần mở là một yêu cầu khác: không giữ lý do của lần trước.
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);
  const reject = useMutation({
    mutationFn: (input: { id: string; reason: string }) => rejectJoinRequest(input.id, { reason: input.reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.joinRequests });
      toast({ tone: "success", title: fill(t.rejectedToast, { name: request?.name ?? "" }) });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ tone: "danger", title: t.failed, description: e.message }),
  });
  const submit = () => {
    if (!request) return;
    // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt → hiển thị nhãn theo ngôn ngữ.
    if (!RejectJoinRequestInputSchema.safeParse({ reason }).success) return setError(t.rejectReasonMax);
    setError(null);
    reject.mutate({ id: request.id, reason });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { reject.reset(); onOpenChange(o); }}>
      <DialogContent
        title={t.rejectTitle}
        icon={<UserX className="h-4 w-4" />}
        size="sm"
        {...(request ? { description: fill(t.rejectDesc, { name: request.name, email: request.email }) } : {})}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label={t.rejectReason} hint={t.rejectReasonHint} {...(error ? { error } : {})}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" variant="danger" loading={reject.isPending}>{t.rejectConfirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Danh sách yêu cầu tham gia đang chờ – chỉ hiện cho Chủ sở hữu/Quản trị và khi có yêu cầu. */
export function JoinRequestsCard() {
  const qc = useQueryClient();
  const t = useMessages(MEMBERS_TAB_MESSAGES);
  const [rejecting, setRejecting] = useState<JoinRequest | null>(null);
  const { data, isError, error } = useQuery({ queryKey: settingsKeys.joinRequests, queryFn: listJoinRequests });
  const approve = useMutation({
    mutationFn: (jr: JoinRequest) => approveJoinRequest(jr.id),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.joinRequests });
      void qc.invalidateQueries({ queryKey: settingsKeys.members });
      toast({ tone: "success", title: fill(t.approvedToast, { name: m.name }) });
    },
    onError: (e: Error) => toast({ tone: "danger", title: t.failed, description: e.message }),
  });

  if (isError) return <Alert tone="danger">{error.message}</Alert>;
  if (!data || data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.joinRequestsTitle}</CardTitle>
        <CardDescription>{t.joinRequestsDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label={t.joinRequestsLabel} className="divide-y divide-border">
          {data.map((jr) => (
            <li key={jr.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar name={jr.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">{jr.name}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {jr.email} · {fill(t.requestedAt, { when: formatRelative(jr.requestedAt) })}
                </p>
              </div>
              <Stack direction="row" gap="sm">
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<UserX className="h-4 w-4" />}
                  aria-label={fill(t.rejectFor, { name: jr.name })}
                  onClick={() => setRejecting(jr)}
                >
                  {t.reject}
                </Button>
                <Button
                  size="sm"
                  leftIcon={<UserCheck className="h-4 w-4" />}
                  aria-label={fill(t.approveFor, { name: jr.name })}
                  loading={approve.isPending && approve.variables?.id === jr.id}
                  onClick={() => approve.mutate(jr)}
                >
                  {t.approve}
                </Button>
              </Stack>
            </li>
          ))}
        </ul>
      </CardContent>
      <RejectJoinRequestDialog request={rejecting} onOpenChange={(o) => !o && setRejecting(null)} />
    </Card>
  );
}
