import { ChevronRight } from "lucide-react";
import type { ElementType } from "react";
import { useMessages, type Messages } from "../lib/i18n.js";
import { cn } from "../lib/cn.js";

const MESSAGES = {
  vi: { nav: "Đường dẫn", collapsed: "Các mục bị ẩn" },
  en: { nav: "Breadcrumb", collapsed: "Hidden items" },
} satisfies Messages<"nav" | "collapsed">;

export type BreadcrumbItem = { label: string; href?: string };

export type BreadcrumbProps = {
  items: readonly BreadcrumbItem[];
  /** Component link, vd `Link` của Next.js. Mặc định thẻ <a>. */
  linkAs?: ElementType;
  /** Quá số mục này thì thu gọn phần giữa thành "…" (giữ mục đầu và các mục cuối). */
  maxItems?: number;
  labels?: Partial<Record<"nav" | "collapsed", string>>;
  className?: string;
};

type Entry = BreadcrumbItem | { ellipsis: true; hidden: string };

export function Breadcrumb({ items, linkAs: LinkTag = "a", maxItems = 4, labels, className }: BreadcrumbProps) {
  const t = useMessages(MESSAGES, labels);
  const entries: Entry[] =
    items.length > maxItems && maxItems >= 2
      ? [
          items[0]!,
          { ellipsis: true, hidden: items.slice(1, items.length - (maxItems - 1)).map((i) => i.label).join(" / ") },
          ...items.slice(items.length - (maxItems - 1)),
        ]
      : [...items];

  return (
    <nav aria-label={t.nav} className={className}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        {entries.map((e, i) => {
          const last = i === entries.length - 1;
          return (
            <li key={"ellipsis" in e ? "__ellipsis" : `${e.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {"ellipsis" in e ? (
                <span title={e.hidden} className="text-fg-subtle">
                  <span aria-hidden="true">…</span>
                  <span className="sr-only">{`${t.collapsed}: ${e.hidden}`}</span>
                </span>
              ) : last ? (
                <span aria-current="page" className="truncate font-medium text-fg">
                  {e.label}
                </span>
              ) : e.href ? (
                <LinkTag
                  href={e.href}
                  className="truncate rounded-sm text-fg-muted hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {e.label}
                </LinkTag>
              ) : (
                <span className="truncate text-fg-muted">{e.label}</span>
              )}
              {!last && <ChevronRight aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 text-fg-subtle")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
