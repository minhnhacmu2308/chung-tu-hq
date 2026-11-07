"use client";
// Khối kết quả của trang liên kết email (thành công / liên kết hỏng) – cùng dáng bước "Hoàn tất" của trang đăng ký.
import { Stack } from "@kb/ui";
import { CheckCircle2, LinkIcon } from "lucide-react";
import type { ReactNode } from "react";

export function AuthResult({ tone, title, description, children }: { tone: "success" | "danger"; title: string; description: ReactNode; children?: ReactNode }) {
  return (
    <Stack gap="md" align="center" className="py-6 text-center">
      {tone === "success" ? (
        <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
      ) : (
        <LinkIcon className="h-12 w-12 text-danger" aria-hidden="true" />
      )}
      <h1 className="text-xl font-semibold text-fg">{title}</h1>
      <p className="max-w-sm text-sm text-fg-muted">{description}</p>
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </Stack>
  );
}
