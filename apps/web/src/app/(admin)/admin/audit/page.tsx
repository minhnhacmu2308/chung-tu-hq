import type { Metadata } from "next";
import { AuditLogPage } from "@/features/admin/audit/audit-log-page";

export const metadata: Metadata = { title: "Nhật ký quản trị" };

export default function Page() {
  return <AuditLogPage />;
}
