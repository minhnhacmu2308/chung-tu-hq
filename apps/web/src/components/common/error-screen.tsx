"use client";
// Màn lỗi dùng chung: 404 (không tìm thấy), 500 (máy chủ lỗi), 502 (máy chủ không phản hồi) và lỗi màn hình.
// `fullPage` = cả trang (có logo, giữa màn hình); không có = nằm trong khung ứng dụng, menu vẫn dùng được.
import { BrandMark, Button, EmptyState, fill, useMessages, type IllustrationName } from "@kb/ui";
import { ArrowLeft, House, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { APP_TITLES } from "@/app/app-titles.messages";
import { ApiError } from "@/lib/api-error";
import { ERROR_SCREEN_MESSAGES } from "./error-screen.messages";

export type ErrorKind = "not-found" | "server" | "gateway" | "screen";

const ART: Record<ErrorKind, IllustrationName> = { "not-found": "not-found", server: "server-error", gateway: "bad-gateway", screen: "error" };
const STATUS: Partial<Record<ErrorKind, number>> = { "not-found": 404, server: 500, gateway: 502 };
const GATEWAY_STATUS = new Set([502, 503, 504]);

/**
 * Phân loại lỗi cho error boundary:
 * - gateway: máy chủ/cổng nối không phản hồi (502/503/504) hoặc mất kết nối mạng;
 * - server: máy chủ trả lỗi 5xx, hoặc lỗi khi dựng trang ở máy chủ (Next gắn `digest`);
 * - screen: lỗi trong chính màn hình (trình duyệt).
 */
export function errorKindOf(error: unknown): Exclude<ErrorKind, "not-found"> {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK" || GATEWAY_STATUS.has(error.status)) return "gateway";
    if (error.status >= 500) return "server";
  }
  if (error && typeof error === "object" && "digest" in error && error.digest) return "server";
  return "screen";
}

function Brand() {
  const t = useMessages(APP_TITLES);
  return (
    <Link href="/" className="flex items-center gap-2 text-base font-semibold text-fg">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-fg">
        <BrandMark small decorative className="h-6 w-6" />
      </span>
      {t.brand}
    </Link>
  );
}

export function ErrorScreen({
  kind,
  title,
  description,
  reference,
  actions,
  fullPage = false,
}: {
  kind: ErrorKind;
  /** Mặc định theo `kind`. */
  title?: ReactNode;
  description?: ReactNode;
  /** Mã tham chiếu (digest của Next) – người dùng gửi cho hỗ trợ để tra log. */
  reference?: string | undefined;
  actions: ReactNode;
  fullPage?: boolean;
}) {
  const t = useMessages(ERROR_SCREEN_MESSAGES);
  const status = STATUS[kind];
  const body = (
    <EmptyState
      illustration={ART[kind]}
      illustrationSize={fullPage ? "lg" : "md"}
      title={<span className={fullPage ? "text-xl" : undefined}>{title ?? t[`${kind}Title`]}</span>}
      description={
        <>
          {status && <span className="sr-only">{fill(t.code, { status })}. </span>}
          {description ?? t[`${kind}Description`]}
          {reference && (
            <span className="mt-2 block text-xs text-fg-subtle">
              {t.reference} <code className="font-mono text-fg-muted">{reference}</code>
            </span>
          )}
        </>
      }
      action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    />
  );
  if (!fullPage) return body;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg p-6">
      <Brand />
      {body}
    </main>
  );
}

/** Nút hay dùng trên màn lỗi. */
export function RetryButton({ onClick }: { onClick: () => void }) {
  const t = useMessages(ERROR_SCREEN_MESSAGES);
  return <Button leftIcon={<RotateCw className="h-4 w-4" />} onClick={onClick}>{t.retry}</Button>;
}

export function HomeButton({ href = "/", label, primary = false }: { href?: string; label?: string; primary?: boolean }) {
  const t = useMessages(ERROR_SCREEN_MESSAGES);
  return (
    <Button asChild variant={primary ? "primary" : "secondary"}>
      <Link href={href}>
        <House className="h-4 w-4" aria-hidden="true" />
        {label ?? t.home}
      </Link>
    </Button>
  );
}

export function BackButton() {
  const t = useMessages(ERROR_SCREEN_MESSAGES);
  const router = useRouter();
  return <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.back()}>{t.back}</Button>;
}
