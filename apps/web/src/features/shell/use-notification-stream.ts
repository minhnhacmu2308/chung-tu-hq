"use client";
// Thông báo realtime (ADR 0017): một luồng cho cả khung ứng dụng. Có sự kiện → làm mới panel + huy hiệu chuông, hiện toast;
// người dùng không nhìn trang → thêm thông báo máy tính (nếu đã cho phép và đúng phạm vi). Luồng lỗi liên tục → app-shell chuyển sang poll.
import type { NotificationEvent } from "@kb/contracts";
import { toast, useMessages } from "@kb/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sessionKeys, subscribeNotifications } from "@/api/session";
import { desktopPermission, pageActive, readDesktopScope, wantsDesktop } from "./desktop-notifications";
import { NOTIFICATION_STREAM_MESSAGES } from "./shell.messages";

/** Số lần lỗi liên tiếp (chưa nối lại được) trước khi chuyển sang poll huy hiệu. */
export const STREAM_ERRORS_BEFORE_POLLING = 3;
export const DEFAULT_DESKTOP_ICON = "/icon.svg";

export function useNotificationStream(opts: { logoSrc?: string | undefined } = {}): { polling: boolean } {
  const qc = useQueryClient();
  const router = useRouter();
  const t = useMessages(NOTIFICATION_STREAM_MESSAGES);
  const [polling, setPolling] = useState(false);
  // Giá trị mới nhất cho callback của luồng mà không phải mở lại luồng khi đổi ngôn ngữ / logo.
  const latest = useRef({ router, t, logoSrc: opts.logoSrc });
  latest.current = { router, t, logoSrc: opts.logoSrc };

  useEffect(() => {
    let errors = 0;
    const open = (href: string | null) => {
      if (href) latest.current.router.push(href);
    };
    const onEvent = (e: NotificationEvent) => {
      void qc.invalidateQueries({ queryKey: sessionKeys.notifications });
      const { t: msg, logoSrc } = latest.current;
      toast({ tone: "info", title: e.title, description: e.body, ...(e.href ? { action: { label: msg.open, onClick: () => open(e.href) } } : {}) });
      if (!wantsDesktop(e.category, { scope: readDesktopScope(), permission: desktopPermission(), pageActive: pageActive() })) return;
      try {
        // `tag` = id: nhiều tab cùng mở chỉ còn một thông báo (trình duyệt thay cái cũ cùng tag).
        const n = new window.Notification(e.title, { body: e.body, tag: e.id, icon: logoSrc ?? DEFAULT_DESKTOP_ICON });
        n.onclick = () => {
          window.focus();
          open(e.href);
          n.close();
        };
      } catch {
        /* Android Chrome không cho `new Notification` ngoài service worker – đã có toast */
      }
    };
    return subscribeNotifications({
      onEvent,
      onOpen: () => {
        errors = 0;
        setPolling(false);
      },
      onError: (fatal) => {
        errors = fatal ? STREAM_ERRORS_BEFORE_POLLING : errors + 1;
        if (errors >= STREAM_ERRORS_BEFORE_POLLING) setPolling(true);
      },
    });
  }, [qc]);

  return { polling };
}
