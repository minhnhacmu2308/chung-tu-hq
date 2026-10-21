"use client";
import { Alert, Button, Dialog, DialogContent, DialogFooter, Field, Input, Stack, fill, toast, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { sessionKeys } from "@/api/session";
import { settingsKeys, transferOwnership } from "@/api/settings";
import type { Member } from "@/mocks/types";
import { MEMBERS_TAB_MESSAGES } from "./members-tab.messages";

/** Xác nhận chuyển quyền sở hữu: nhập lại mật khẩu; xong thì tải lại danh sách thành viên + phiên (vai trò của mình đổi thành Quản trị). */
export function TransferOwnershipDialog({ target, onOpenChange }: { target: Member | null; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const t = useMessages(MEMBERS_TAB_MESSAGES);
  const [password, setPassword] = useState("");
  const open = target !== null;
  const transfer = useMutation({
    mutationFn: (input: { id: string; password: string }) => transferOwnership(input.id, { password: input.password }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.members });
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
      toast({ tone: "success", title: fill(t.transferredToast, { name: res.owner.name }) });
      onOpenChange(false);
    },
  });
  const { reset } = transfer;
  // Không giữ mật khẩu/lỗi giữa hai lần mở.
  useEffect(() => {
    if (open) {
      setPassword("");
      reset();
    }
  }, [open, reset]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t.transferTitle}
        icon={<Crown className="h-4 w-4" />}
        size="sm"
        {...(target ? { description: fill(t.transferDesc, { name: target.name }) } : {})}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (target && password) transfer.mutate({ id: target.id, password });
          }}
        >
          <Stack gap="md">
            {transfer.isError && <Alert tone="danger">{transfer.error.message}</Alert>}
            <Field label={t.transferPassword} hint={t.transferPasswordHint} required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" variant="danger" loading={transfer.isPending} disabled={!password}>{t.transferConfirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
