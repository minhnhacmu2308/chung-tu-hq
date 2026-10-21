"use client";
import { Button, EmptyState, useMessages } from "@kb/ui";
import Link from "next/link";
import { ADMIN_ERROR_MESSAGES } from "./error.messages";

// Lỗi không lường trước ở một màn quản trị: giữ nguyên menu, cho thử lại ngay tại chỗ.
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  const t = useMessages(ADMIN_ERROR_MESSAGES);
  return (
    <EmptyState
      illustration="error"
      title={t.title}
      description={t.description}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>{t.retry}</Button>
          <Button asChild variant="secondary">
            <Link href="/admin">{t.back}</Link>
          </Button>
        </div>
      }
    />
  );
}
