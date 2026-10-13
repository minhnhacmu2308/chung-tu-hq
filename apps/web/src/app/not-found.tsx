"use client";
// @kb/ui là thư viện component phía client (dùng hook) nên trang này phải là Client Component.
import { BrandMark, Button, EmptyState } from "@kb/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-6">
      <span className="flex items-center gap-2 text-base font-semibold text-fg">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-fg">
          <BrandMark small decorative className="h-6 w-6" />
        </span>
        KhaiBáo AI
      </span>
      <EmptyState
        title="Không tìm thấy trang"
        description="Đường dẫn này không tồn tại hoặc đã được chuyển đi. Kiểm tra lại địa chỉ, hoặc quay về trang tổng quan."
        action={
          <Button asChild>
            <Link href="/">Về trang tổng quan</Link>
          </Button>
        }
      />
    </main>
  );
}
