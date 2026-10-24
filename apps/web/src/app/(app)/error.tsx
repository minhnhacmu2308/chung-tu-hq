"use client";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { ErrorScreen, errorKindOf, HomeButton, RetryButton } from "@/components/common/error-screen";

// Lỗi không lường trước ở một màn: giữ nguyên menu, cho thử lại ngay tại chỗ.
// Máy chủ không phản hồi (502/503/504, mất mạng) và máy chủ lỗi (500) có hình + lời riêng.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  // Lỗi dựng ở máy chủ: phải refresh để lấy lại dữ liệu trang, reset riêng chỉ dựng lại phía trình duyệt.
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return <ErrorScreen kind={errorKindOf(error)} reference={error.digest} actions={<><RetryButton onClick={retry} /><HomeButton /></>} />;
}
