import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { DashboardPage } from "@/features/dashboard/dashboard-page";

export const metadata: Metadata = { title: VI_TITLES.overview };

export default function Page() {
  return <DashboardPage />;
}
