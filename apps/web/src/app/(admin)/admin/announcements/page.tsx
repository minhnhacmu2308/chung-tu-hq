import type { Metadata } from "next";
import { AnnouncementsPage } from "@/features/admin/announcements/announcements-page";

export const metadata: Metadata = { title: "Thông báo hệ thống" };

export default function Page() {
  return <AnnouncementsPage />;
}
