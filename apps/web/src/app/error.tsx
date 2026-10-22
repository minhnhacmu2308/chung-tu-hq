"use client";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { ErrorScreen, errorKindOf, HomeButton, RetryButton } from "@/components/common/error-screen";

// Lỗi ở trang nằm ngoài khung ứng dụng (đăng nhập, đăng ký…): cả trang, có logo.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return <ErrorScreen kind={errorKindOf(error)} fullPage reference={error.digest} actions={<><RetryButton onClick={retry} /><HomeButton /></>} />;
}
