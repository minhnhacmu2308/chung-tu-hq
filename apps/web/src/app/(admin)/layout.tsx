import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/features/admin/shell/admin-shell";

export const metadata: Metadata = { title: { default: "Quản trị hệ thống", template: "%s · Quản trị KhaiBáo AI" } };

// Khu Quản trị hệ thống: khung và menu riêng, chỉ tài khoản đội vận hành vào được (AdminShell kiểm tra quyền).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
