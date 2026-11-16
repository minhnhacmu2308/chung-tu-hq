"use client";
import type { Notification, NotificationCategory, NotificationListQuery, NotificationPage } from "@kb/contracts";
import { NOTIFICATION_CATEGORIES } from "@kb/contracts";
import {
  Button, ConfirmDialog, EmptyState, FeedGroup, FeedItem, SearchInput, SegmentedControl, Select, SkeletonList, Tooltip, fill, useMessages, type Tone,
} from "@kb/ui";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Bell, CheckCheck, FolderOpen, Landmark, Mail, MailOpen, Megaphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { deleteNotification, listNotifications, markAllNotificationsRead, sessionKeys, setNotificationRead } from "@/api/session";
import { LoadError } from "@/components/common/load-error";
import { formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { DesktopNotificationSettings } from "./desktop-notification-settings";
import { NOTIFICATIONS_MESSAGES } from "./shell.messages";

const PAGE_SIZE = 20;
const STATUS_KEY = "kb-notifications-status";
const LIST_KEY = [...sessionKeys.notifications, "list"] as const;
type Status = "all" | "unread";

const CATEGORY_LOOK: Record<NotificationCategory, { icon: ReactNode; tone: Tone }> = {
  DOSSIER: { icon: <FolderOpen />, tone: "primary" },
  CUSTOMS: { icon: <Landmark />, tone: "info" },
  SYSTEM: { icon: <Megaphone />, tone: "warning" },
  OTHER: { icon: <Bell />, tone: "neutral" },
};

/** Hôm nay / Hôm qua / Trước đó theo ngày giờ máy người dùng; giữ thứ tự mới nhất trước. */
export function groupByDay<T extends { at: string }>(items: T[], now = new Date()): { key: "today" | "yesterday" | "earlier"; items: T[] }[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const keyOf = (at: string) => {
    const t = new Date(at).getTime();
    return t >= today ? "today" : t >= today - 86_400_000 ? "yesterday" : "earlier";
  };
  const groups: { key: "today" | "yesterday" | "earlier"; items: T[] }[] = [];
  for (const n of items) {
    const key = keyOf(n.at);
    if (groups.at(-1)?.key === key) groups.at(-1)!.items.push(n);
    else groups.push({ key, items: [n] });
  }
  return groups;
}

function useStoredStatus(): [Status, (s: Status) => void] {
  const [status, setStatus] = useState<Status>("all");
  useEffect(() => {
    try {
      if (localStorage.getItem(STATUS_KEY) === "unread") setStatus("unread");
    } catch {
      /* bỏ qua */
    }
  }, []);
  return [
    status,
    (s) => {
      setStatus(s);
      try {
        localStorage.setItem(STATUS_KEY, s);
      } catch {
        /* bỏ qua */
      }
    },
  ];
}

export function NotificationsPanel({ onNavigate }: { onNavigate: () => void }) {
  const t = useMessages(NOTIFICATIONS_MESSAGES);
  const qc = useQueryClient();
  const [status, setStatus] = useStoredStatus();
  const [category, setCategory] = useState<NotificationCategory | "">("");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const filter: NotificationListQuery = { status, limit: PAGE_SIZE, ...(category ? { category } : {}), ...(q ? { q } : {}) };

  const list = useInfiniteQuery({
    queryKey: [...LIST_KEY, filter],
    queryFn: ({ pageParam }) => listNotifications({ ...filter, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // Đổi bộ lọc: giữ danh sách cũ tới khi có kết quả mới – không nháy khung tải.
    placeholderData: (prev) => prev,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = list.data?.pages[0]?.unreadCount ?? 0;

  // Sửa ngay trên các trang đã tải (mượt, không chờ mạng), xong thì tải lại cả danh sách lẫn huy hiệu chuông.
  const patch = async (fn: (items: Notification[]) => Notification[]) => {
    // Dừng lượt tải đang chạy để nó không ghi đè thay đổi vừa sửa (dòng nháy lại).
    await qc.cancelQueries({ queryKey: LIST_KEY });
    qc.setQueriesData<InfiniteData<NotificationPage>>({ queryKey: LIST_KEY }, (d) => d && { ...d, pages: d.pages.map((p) => ({ ...p, items: fn(p.items) })) });
  };
  const refresh = () => qc.invalidateQueries({ queryKey: sessionKeys.notifications });
  const setRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => setNotificationRead(id, read),
    onMutate: ({ id, read }) => patch((xs) => xs.map((n) => (n.id === id ? { ...n, read } : n))),
    onError: toastMutationError(t.markFailed),
    onSettled: refresh,
  });
  // Xóa vĩnh viễn → hỏi trước (nut-bam.md (d)).
  const [removing, setRemoving] = useState<Notification | null>(null);
  const remove = useMutation({
    mutationFn: deleteNotification,
    onMutate: (id) => patch((xs) => xs.filter((n) => n.id !== id)),
    onSuccess: () => setRemoving(null),
    onError: toastMutationError(t.deleteFailed),
    onSettled: refresh,
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => patch((xs) => xs.map((n) => ({ ...n, read: true }))),
    onError: toastMutationError(t.markFailed),
    onSettled: refresh,
  });

  // Cuộn gần đáy vùng danh sách → tải trang kế.
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scrollRef.current, rootMargin: "0px 0px 160px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filtered = !!category || !!q;
  const clearFilters = () => {
    setCategory("");
    setSearch("");
  };
  const open = (n: Notification) => {
    if (!n.read) setRead.mutate({ id: n.id, read: true });
    if (n.href) onNavigate();
  };

  let body: ReactNode;
  if (list.isLoading) body = <SkeletonList rows={5} />;
  else if (list.isError) body = <LoadError title={t.loadFailed} onRetry={() => void list.refetch()} />;
  else if (!items.length)
    body = filtered ? (
      <EmptyState illustration="no-results" title={t.noResults} description={t.noResultsDesc} action={<Button size="sm" variant="secondary" onClick={clearFilters}>{t.clearFilters}</Button>} />
    ) : status === "unread" ? (
      <EmptyState icon={<CheckCheck />} title={t.allRead} description={t.allReadDesc} />
    ) : (
      <EmptyState title={t.empty} description={t.emptyDesc} />
    );
  else
    body = (
      <>
        {groupByDay(items).map((g) => (
          <FeedGroup key={g.key} label={t[g.key]}>
            {g.items.map((n) => (
              <FeedItem
                key={n.id}
                title={n.title}
                description={n.body}
                meta={formatRelative(n.at)}
                {...CATEGORY_LOOK[n.category]}
                unread={!n.read}
                {...(n.href ? { href: n.href, linkAs: Link } : {})}
                onOpen={() => open(n)}
                actions={
                  <>
                    <Tooltip content={n.read ? t.markUnread : t.markRead}>
                      <Button size="icon-sm" variant="ghost" aria-label={n.read ? t.markUnread : t.markRead} onClick={() => setRead.mutate({ id: n.id, read: !n.read })}>
                        {n.read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                      </Button>
                    </Tooltip>
                    <Tooltip content={t.remove}>
                      <Button size="icon-sm" variant="danger-ghost" aria-label={t.remove} onClick={() => setRemoving(n)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </>
                }
              />
            ))}
          </FeedGroup>
        ))}
        <div ref={sentinelRef} />
        {isFetchingNextPage && <SkeletonList rows={2} />}
        {!hasNextPage && <p className="py-3 text-center text-xs text-fg-subtle">{t.end}</p>}
      </>
    );

  return (
    <div className="dialog-fill flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label={t.show}
          hideLabel
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: t.statusAll },
            { value: "unread", label: fill(t.statusUnread, { n: unreadCount }) },
          ]}
        />
        <Button size="sm" variant="secondary" leftIcon={<CheckCheck className="h-4 w-4" />} disabled={unreadCount === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>
          {t.markAll}
        </Button>
      </div>
      <div className="flex gap-2">
        <SearchInput aria-label={t.search} placeholder={t.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" inputClassName="h-8" />
        <Select
          aria-label={t.category}
          className="h-8 w-36 shrink-0"
          value={category}
          onChange={(e) => setCategory(e.target.value as NotificationCategory | "")}
          options={[{ value: "", label: t.categoryAll }, ...NOTIFICATION_CATEGORIES.map((c) => ({ value: c, label: t[`cat${c}`] }))]}
        />
        <DesktopNotificationSettings />
      </div>
      <div ref={scrollRef} className="-mx-3 min-h-0 flex-1 overflow-y-auto px-1" aria-busy={list.isFetching}>
        {body}
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t.removeTitle}
        icon={<Trash2 className="h-4 w-4" />}
        subject={removing?.title}
        irreversible
        confirmLabel={t.removeConfirm}
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        labels={{ keep: t.removeKeep }}
      >
        {t.removeBody}
      </ConfirmDialog>
    </div>
  );
}
