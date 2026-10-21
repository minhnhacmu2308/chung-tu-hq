"use client";
import {
  Button, EmptyState, Skeleton, Stack, cn, SkeletonList, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { listNotifications, markAllNotificationsRead, sessionKeys } from "@/api/session";
import { formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { NOTIFICATIONS_MESSAGES } from "./shell.messages";

export function NotificationsPanel({ onNavigate }: { onNavigate: () => void }) {
  const t = useMessages(NOTIFICATIONS_MESSAGES);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: sessionKeys.notifications, queryFn: listNotifications });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.notifications }),
    onError: toastMutationError(t.markFailed),
  });

  if (isLoading) return <SkeletonList rows={3} />;
  if (!data?.length) return <EmptyState title={t.empty} description={t.emptyDesc} />;

  return (
    <Stack gap="sm">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" loading={markAll.isPending} onClick={() => markAll.mutate()}>{t.markAll}</Button>
      </div>
      {data.map((n) => (
        <Link
          key={n.id}
          href={n.href ?? "#"}
          onClick={onNavigate}
          className={cn("block rounded-md border border-border p-3 transition-colors hover:bg-surface-muted", !n.read && "border-primary bg-primary-subtle")}
        >
          <p className="text-sm font-medium text-fg">{n.title}</p>
          <p className="text-sm text-fg-muted">{n.body}</p>
          <p className="mt-1 text-xs text-fg-subtle">{formatRelative(n.at)}</p>
        </Link>
      ))}
    </Stack>
  );
}
