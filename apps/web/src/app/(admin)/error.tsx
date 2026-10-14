"use client";
import { Button, EmptyState } from "@kb/ui";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";

// Lỗi không lường trước ở một màn quản trị: giữ nguyên menu, cho thử lại ngay tại chỗ.
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="Màn hình này gặp lỗi"
      description="Chưa có thao tác nào bị thực hiện dở. Thử tải lại màn hình; nếu vẫn lỗi, quay về tổng quan vận hành."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Thử lại</Button>
          <Button asChild variant="secondary">
            <Link href="/admin">Về tổng quan vận hành</Link>
          </Button>
        </div>
      }
    />
  );
}
