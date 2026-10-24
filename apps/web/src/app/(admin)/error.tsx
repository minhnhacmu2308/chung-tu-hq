"use client";
import { useMessages } from "@kb/ui";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { ErrorScreen, errorKindOf, HomeButton, RetryButton } from "@/components/common/error-screen";
import { ADMIN_ERROR_MESSAGES } from "./error.messages";

// Lỗi không lường trước ở một màn quản trị: giữ nguyên menu, cho thử lại ngay tại chỗ.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useMessages(ADMIN_ERROR_MESSAGES);
  const router = useRouter();
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  const kind = errorKindOf(error);
  return (
    <ErrorScreen
      kind={kind}
      {...(kind === "screen" ? { title: t.title, description: t.description } : {})}
      reference={error.digest}
      actions={<><RetryButton onClick={retry} /><HomeButton href="/admin" label={t.back} /></>}
    />
  );
}
