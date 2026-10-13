"use client";
import { Button, EmptyState, Skeleton, Stack, cn } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { listNotifications, markAllNotificationsRead, sessionKeys } from "@/api/session";
import { formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";

export function NotificationsPanel({ onNavigate }: { onNavigate: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: sessionKeys.notifications, queryFn: listNotifications });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.notifications }),
    onError: toastMutationError("Không đánh dấu được đã đọc"),
  });

  if (isLoading) return <Stack gap="sm"><Skeleton className="h-14" /><Skeleton className="h-14" /></Stack>;
  if (!data?.length) return <EmptyState title="Không có thông báo" description="Thông báo về hồ sơ và kết quả Hải quan sẽ hiện ở đây." />;

  return (
    <Stack gap="sm">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" loading={markAll.isPending} onClick={() => markAll.mutate()}>Đánh dấu đã đọc hết</Button>
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
