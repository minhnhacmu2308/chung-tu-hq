// Danh sách dạng luồng tin (thông báo, hoạt động): nhóm theo mốc thời gian có nhãn dính, mỗi mục là một dòng bấm được
// (liên kết phủ cả dòng) với icon theo nhóm, tiêu đề, mô tả 2 dòng, thời gian; thao tác của mục hiện khi rê chuột / Tab.
import type { ElementType, MouseEvent, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import type { Tone } from "./feedback.js";
import { IconTile } from "./icon-tile.js";

const MESSAGES = {
  vi: { unread: "Chưa đọc" },
  en: { unread: "Unread" },
  zh: { unread: "未读" },
} satisfies Messages<"unread">;

export type FeedGroupProps = { label: string; children: ReactNode; className?: string };

/** Một nhóm mục (vd "Hôm nay"): nhãn nhỏ dính đầu vùng cuộn, mục nằm trong danh sách. */
export function FeedGroup({ label, children, className }: FeedGroupProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <h3 id={id} className="sticky top-0 z-20 bg-surface px-3 py-1.5 text-xs font-medium text-fg-subtle">
        {label}
      </h3>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

export type FeedItemProps = {
  title: string;
  description?: ReactNode;
  /** Dòng phụ cạnh tiêu đề (thời gian tương đối). */
  meta?: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  /** Chưa đọc: chấm màu chính + nền dịu + tiêu đề đậm hơn; trình đọc màn hình nghe "Chưa đọc". */
  unread?: boolean;
  /** Có `href` → tiêu đề là liên kết phủ cả dòng (`linkAs` để dùng Link của router); không có → nút. */
  href?: string;
  linkAs?: ElementType;
  onOpen?: (e: MouseEvent) => void;
  /** Nút icon (`Button size="icon-sm" variant="ghost"` + Tooltip + aria-label). Hiện khi rê chuột / Tab vào dòng; màn cảm ứng luôn hiện. */
  actions?: ReactNode;
  labels?: Partial<Record<"unread", string>>;
  className?: string;
};

/** Một dòng của luồng tin – đặt trong `FeedGroup`. */
export function FeedItem({ title, description, meta, icon, tone, unread = false, href, linkAs: LinkTag = "a", onOpen, actions, labels, className }: FeedItemProps) {
  const t = useMessages(MESSAGES, labels);
  // Liên kết/nút phủ cả dòng bằng ::after; nút thao tác nằm trên (z-10) nên vẫn bấm được riêng.
  const overlay = "text-left after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus";
  const name = (
    <>
      {title}
      {unread && <span className="sr-only">{` (${t.unread})`}</span>}
    </>
  );
  return (
    <li
      data-unread={unread || undefined}
      className={cn(
        "group relative flex gap-3 rounded-md px-3 py-2.5 hover:bg-surface-muted focus-within:bg-surface-muted",
        "motion-safe:animate-fade-in",
        unread && "bg-primary-subtle/50",
        className,
      )}
    >
      <IconTile icon={icon} tone={tone ?? "neutral"} size="md" />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm text-fg [overflow-wrap:anywhere]", unread ? "font-semibold" : "font-medium")}>
          {href ? (
            <LinkTag href={href} onClick={onOpen} className={overlay}>
              {name}
            </LinkTag>
          ) : (
            <button type="button" onClick={onOpen} className={overlay}>
              {name}
            </button>
          )}
        </p>
        {description && <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted [overflow-wrap:anywhere]">{description}</p>}
      </div>
      {/* Cột phải: thời gian + chấm chưa đọc và nút thao tác CHUNG một ô lưới – rê chuột/Tab thì đổi chỗ cho nhau, không bao giờ đè chữ.
          Màn cảm ứng (không rê chuột được): nút nằm dòng dưới, luôn hiện. */}
      {(meta || unread || actions) && (
        <div className="grid shrink-0 justify-items-end gap-1 self-start">
          <span
            className={cn(
              "col-start-1 row-start-1 flex items-center gap-1.5 pt-0.5 text-xs text-fg-subtle",
              actions && "transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:opacity-100",
            )}
          >
            {meta}
            {unread && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />}
          </span>
          {actions && (
            <div
              className={cn(
                "z-10 col-start-1 row-start-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
                "[@media(hover:none)]:row-start-2 [@media(hover:none)]:opacity-100",
              )}
            >
              {actions}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
