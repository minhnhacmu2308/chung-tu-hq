"use client";
// Dùng chung cho màn Hộp thư chứng từ và mục Hộp thư ở Tài khoản & tích hợp: tải tổng quan hộp thư (tự hỏi lại khi đang lấy thư),
// báo kết quả khi lấy thư xong và tải lại danh sách email.
import type { MailboxOverview } from "@kb/contracts";
import { fill, toast, useMessages, useUiLocale } from "@kb/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getMailboxOverview, inboxKeys, mailboxKeys } from "@/api/mailbox";
import { getSession, sessionKeys } from "@/api/session";
import { reasonText } from "@/lib/reason-codes";
import { INBOX_MESSAGES } from "./inbox.messages";

/** Vai trò được kết nối hộp thư, lấy thư và xếp file vào hồ sơ (Người xem chỉ xem). */
const MAILBOX_ROLES = new Set(["OWNER", "ADMIN", "DECLARANT", "APPROVER"]);
const POLL_MS = 2000;

export const isSyncing = (o: MailboxOverview | undefined) => !!o?.connections.some((c) => c.status === "SYNCING");

export function useMailboxSession() {
  const { data: session } = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  return {
    session,
    canUse: !!session && MAILBOX_ROLES.has(session.user.role),
    /** Gỡ kết nối: người đã kết nối hoặc Quản trị / Chủ sở hữu. */
    canDisconnect: (connectedBy: string) => !!session && (session.user.id === connectedBy || session.user.role === "ADMIN" || session.user.role === "OWNER"),
  };
}

export function useMailboxOverview() {
  const overview = useQuery({ queryKey: mailboxKeys.overview, queryFn: getMailboxOverview, refetchInterval: (q) => (isSyncing(q.state.data) ? POLL_MS : false) });
  useSyncResultToast(overview.data);
  return overview;
}

/** Hộp thư vừa chuyển từ "đang lấy thư" sang trạng thái khác → báo số email mới (hoặc lỗi) và tải lại hộp thư chứng từ. */
function useSyncResultToast(overview: MailboxOverview | undefined) {
  const t = useMessages(INBOX_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const syncing = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!overview) return;
    const now = new Set(overview.connections.filter((c) => c.status === "SYNCING").map((c) => c.id));
    const prev = syncing.current;
    syncing.current = now;
    if (!prev) return;
    const finished = overview.connections.filter((c) => prev.has(c.id) && !now.has(c.id));
    if (!finished.length) return;
    void qc.invalidateQueries({ queryKey: inboxKeys.all });
    const failed = finished.find((c) => c.status === "ERROR" || c.status === "REAUTH");
    if (failed) {
      toast({ tone: "danger", title: t.fetchFailed, description: reasonText(failed.lastError ?? "MAILBOX_SYNC_FAILED", { email: failed.email }, undefined, locale) });
      return;
    }
    const n = finished.reduce((s, c) => s + c.lastSyncCount, 0);
    toast(n > 0 ? { tone: "success", title: fill(t.fetchedNew, { n }) } : { tone: "info", title: t.fetchedNothing });
  }, [overview, qc, t, locale]);
}
