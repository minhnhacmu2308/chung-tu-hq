"use client";
import { Button, EmptyState } from "@kb/ui";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";

// Lỗi không lường trước ở một màn: giữ nguyên menu, cho thử lại ngay tại chỗ.
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="Màn hình này gặp lỗi"
      description="Dữ liệu của bạn không bị ảnh hưởng. Thử tải lại màn hình; nếu vẫn lỗi, quay về trang tổng quan."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Thử lại</Button>
          <Button asChild variant="secondary">
            <Link href="/">Về trang tổng quan</Link>
          </Button>
        </div>
      }
    />
  );
}
