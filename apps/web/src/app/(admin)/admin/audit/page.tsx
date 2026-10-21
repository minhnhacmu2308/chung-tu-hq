import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { AuditLogPage } from "@/features/admin/audit/audit-log-page";

export const metadata: Metadata = { title: ADMIN_TITLES.audit };

export default function Page() {
  return <AuditLogPage />;
}
