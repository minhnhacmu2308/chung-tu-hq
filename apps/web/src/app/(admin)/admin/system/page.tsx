import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { SystemHealthPage } from "@/features/admin/system/system-health-page";

export const metadata: Metadata = { title: ADMIN_TITLES.system };

export default function Page() {
  return <SystemHealthPage />;
}
