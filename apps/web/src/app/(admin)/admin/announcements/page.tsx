import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { AnnouncementsPage } from "@/features/admin/announcements/announcements-page";

export const metadata: Metadata = { title: ADMIN_TITLES.announcements };

export default function Page() {
  return <AnnouncementsPage />;
}
