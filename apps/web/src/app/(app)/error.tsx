"use client";
import { Button, EmptyState, useMessages } from "@kb/ui";
import Link from "next/link";
import { APP_ERROR_MESSAGES } from "@/app/app-pages.messages";

// Lỗi không lường trước ở một màn: giữ nguyên menu, cho thử lại ngay tại chỗ.
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = useMessages(APP_ERROR_MESSAGES);
  return (
    <EmptyState
      illustration="error"
      title={t.title}
      description={t.description}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>{t.retry}</Button>
          <Button asChild variant="secondary">
            <Link href="/">{t.home}</Link>
          </Button>
        </div>
      }
    />
  );
}
