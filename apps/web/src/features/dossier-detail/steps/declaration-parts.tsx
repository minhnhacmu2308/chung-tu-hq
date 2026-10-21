"use client";
// Mảnh giao diện dùng chung cho bước 4–6 (agent, review tờ khai, truyền Hải quan).
import { getFormatLocale } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import {
  Alert, Badge, Button, Card, CardContent, Skeleton, Stack, cn, SkeletonCard, pickMessages, useMessages, useUiLocale, type UiLocale,
} from "@kb/ui";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { VALUE_SOURCE_LABELS, type ValueSource } from "@/mocks/types";
import { DECLARATION_PARTS_MESSAGES } from "./declaration-parts.messages";

/** Nhãn nguồn của một chỉ tiêu: Invoice / B/L / Hồ sơ / Hệ thống… */
export function SourceChip({ source, className }: { source: ValueSource; className?: string }) {
  const t = useMessages(DECLARATION_PARTS_MESSAGES);
  const sources = useMessages(VALUE_SOURCE_LABELS);
  return (
    <Badge tone={source === "SYSTEM" || source === "DEFAULT" ? "neutral" : source === "ACCOUNT" || source === "DOSSIER" ? "info" : "primary"} variant="outline" className={className}>
      <FileText aria-hidden="true" className="h-3 w-3" />
      <span className="sr-only">{t.sourcePrefix}</span>
      {sources[source]}
    </Badge>
  );
}

/** Thanh hành động dính đáy màn hình (tổng thuế, nút chuyển bước). */
export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // kb-allow-raw: chừa chỗ cho nút trợ lý AI nổi (fixed, ở mọi bề rộng – màn hẹp nút trợ lý cũng đè lên góc phải thanh)
        "sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface py-3 pl-4 pr-20 shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StepLoading() {
  const t = useMessages(DECLARATION_PARTS_MESSAGES);
  return (
    <Stack gap="md" aria-busy="true" aria-label={t.loading}>
      <SkeletonCard lines={2} />
      <SkeletonCard lines={8} />
    </Stack>
  );
}

export function StepError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useMessages(DECLARATION_PARTS_MESSAGES);
  const locale = useUiLocale();
  return (
    <Card>
      <CardContent className="pt-5">
        <Alert
          tone="danger"
          title={t.loadFailed}
          action={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              {t.retry}
            </Button>
          }
        >
          {errorText(error, locale, t.unknownError)}
        </Alert>
      </CardContent>
    </Card>
  );
}

/** Thông báo lỗi nghiệp vụ từ api: có mã lý do/mã lỗi đã biết → dịch theo `locale`, không thì câu tiếng Việt của server (errorText). */
export const errorMessage = (e: unknown, locale: UiLocale = getFormatLocale()) => errorText(e, locale, pickMessages(DECLARATION_PARTS_MESSAGES, locale).genericError);

/** Hai cột nhãn – giá trị dùng trong các khối tổng hợp. `wrap`: giá trị chữ dài (tên cơ quan…) được xuống dòng thay vì giữ một dòng. */
export function KeyValue({ label, value, hint, strong = false, wrap = false }: { label: ReactNode; value: ReactNode; hint?: ReactNode; strong?: boolean; wrap?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className={cn("text-sm", strong ? "font-semibold text-fg" : "text-fg-muted")}>{label}</p>
        {hint && <div className="mt-0.5 text-xs text-fg-subtle">{hint}</div>}
      </div>
      <p className={cn("text-right text-sm tabular-nums", wrap ? "min-w-0 break-words" : "shrink-0", strong ? "text-base font-semibold text-fg" : "text-fg")}>{value}</p>
    </div>
  );
}
