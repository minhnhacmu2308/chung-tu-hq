"use client";
// Mảnh giao diện dùng chung cho bước 4–6 (agent, review tờ khai, truyền Hải quan).
import {
  Alert, Badge, Button, Card, CardContent, Skeleton, Stack, cn, SkeletonCard,
} from "@kb/ui";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { VALUE_SOURCE_LABELS, type ValueSource } from "@/mocks/types";

/** Nhãn nguồn của một chỉ tiêu: Invoice / B/L / Hồ sơ / Hệ thống… */
export function SourceChip({ source, className }: { source: ValueSource; className?: string }) {
  return (
    <Badge tone={source === "SYSTEM" || source === "DEFAULT" ? "neutral" : source === "ACCOUNT" || source === "DOSSIER" ? "info" : "primary"} variant="outline" className={className}>
      <FileText aria-hidden="true" className="h-3 w-3" />
      <span className="sr-only">Nguồn: </span>
      {VALUE_SOURCE_LABELS[source]}
    </Badge>
  );
}

/** Thanh hành động dính đáy màn hình (tổng thuế, nút chuyển bước). */
export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // kb-allow-raw: chừa chỗ cho nút trợ lý AI nổi (fixed, theo bề rộng màn hình)
        "sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg md:pr-20",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StepLoading() {
  return (
    <Stack gap="md" aria-busy="true" aria-label="Đang tải">
      <SkeletonCard lines={2} />
      <SkeletonCard lines={8} />
    </Stack>
  );
}

export function StepError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <Alert
          tone="danger"
          title="Không tải được dữ liệu"
          action={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Thử lại
            </Button>
          }
        >
          {error instanceof Error ? error.message : "Lỗi không xác định"}
        </Alert>
      </CardContent>
    </Card>
  );
}

/** Thông báo lỗi nghiệp vụ từ api (ApiError có message tiếng Việt). */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Có lỗi xảy ra, thử lại sau");

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
