import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { AdminOverviewPage } from "@/features/admin/overview/admin-overview-page";

export const metadata: Metadata = { title: ADMIN_TITLES.overview };

export default function Page() {
  return <AdminOverviewPage />;
}
