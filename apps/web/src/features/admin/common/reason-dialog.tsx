"use client";
import { AdminReasonSchema } from "@kb/contracts";
import { Button, Dialog, DialogContent, DialogFooter, Field, Stack, Textarea, useMessages } from "@kb/ui";
import { useEffect, useState, type ReactNode } from "react";
import { REASON_DIALOG_MESSAGES } from "./reason-dialog.messages";

export type ReasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Icon đầu popup – bắt buộc như mọi popup của hệ thống. */
  icon: ReactNode;
  confirmLabel: string;
  /** "danger" cho thao tác chặn khách (khóa, thu hồi). */
  tone?: "primary" | "danger";
  pending: boolean;
  /** Ô nhập thêm, hiện phía trên ô lý do (vd chọn gói mới). */
  children?: ReactNode;
  /** `false` khi ô nhập thêm chưa hợp lệ. */
  canSubmit?: boolean;
  reasonHint?: string;
  onConfirm: (reason: string) => void;
};

/**
 * Hộp xác nhận dùng cho MỌI thao tác ghi của back-office: bắt nhập lý do (ghi vào nhật ký quản trị) trước khi chạy.
 * Lỗi từ máy chủ do nơi gọi báo bằng toast; hộp vẫn mở để sửa và thử lại.
 */
export function ReasonDialog({
  open, onOpenChange, title, description, icon, confirmLabel, tone = "primary", pending, children, canSubmit = true, reasonHint, onConfirm,
}: ReasonDialogProps) {
  const t = useMessages(REASON_DIALOG_MESSAGES);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Mỗi lần mở là một thao tác mới: không giữ lý do của lần trước.
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const submit = () => {
    const parsed = AdminReasonSchema.safeParse(reason);
    if (!parsed.success) {
      // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt → hiển thị theo mã lỗi.
      const code = parsed.error.issues[0]?.code;
      setError(code === "too_small" ? t.reasonMin : code === "too_big" ? t.reasonMax : t.reasonRequired);
      return;
    }
    setError(null);
    onConfirm(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} size="sm" icon={icon} {...(description ? { description } : {})}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="md">
            {children}
            <Field label={t.reason} required hint={reasonHint ?? t.hint} {...(error ? { error } : {})}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} loading={pending} disabled={!canSubmit}>{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
