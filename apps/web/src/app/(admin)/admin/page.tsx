import type { Metadata } from "next";
import { AdminOverviewPage } from "@/features/admin/overview/admin-overview-page";

export const metadata: Metadata = { title: "Tổng quan vận hành" };

export default function Page() {
  return <AdminOverviewPage />;
}
