"use client";
// Ảnh đại diện của chính người đang đăng nhập (ADR 0016) – mọi vai trò tự đổi được.
import type { Member, Session } from "@kb/contracts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, ImagePicker, SkeletonList, toast, useMessages } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { memberAvatarSrc, removeMyAvatar, uploadMyAvatar } from "@/api/branding";
import { getSession, sessionKeys } from "@/api/session";
import { settingsKeys } from "@/api/settings";
import { LoadError } from "@/components/common/load-error";
import { toastMutationError } from "@/lib/mutation-error";
import { AVATAR_CARD_MESSAGES } from "./avatar-card.messages";

export function AvatarCard() {
  const qc = useQueryClient();
  const m = useMessages(AVATAR_CARD_MESSAGES);
  const { data: session, isLoading, isError, refetch } = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const applied = (user: Member) => {
    qc.setQueryData<Session>(sessionKeys.me, (s) => (s ? { ...s, user } : s));
    void qc.invalidateQueries({ queryKey: settingsKeys.members });
  };
  const upload = useMutation({
    mutationFn: uploadMyAvatar,
    onSuccess: (u) => {
      applied(u);
      toast({ tone: "success", title: m.saved });
    },
    onError: toastMutationError(m.error),
  });
  const remove = useMutation({
    mutationFn: removeMyAvatar,
    onSuccess: (u) => {
      applied(u);
      setConfirmRemove(false);
      toast({ tone: "success", title: m.removed });
    },
    onError: toastMutationError(m.error),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>{m.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <LoadError onRetry={() => void refetch()} />
        ) : isLoading || !session ? (
          <SkeletonList rows={1} />
        ) : (
          <ImagePicker
            shape="circle"
            name={session.user.name}
            src={memberAvatarSrc(session.user)}
            hint={m.hint}
            loading={upload.isPending}
            removing={remove.isPending}
            onPick={(f) => upload.mutate(f)}
            onRemove={() => setConfirmRemove(true)}
          />
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        icon={<Trash2 className="h-4 w-4" />}
        title={m.removeTitle}
        confirmLabel={m.removeConfirm}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        {m.removeBody}
      </ConfirmDialog>
    </Card>
  );
}
