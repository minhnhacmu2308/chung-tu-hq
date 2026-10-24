import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { StaffPage } from "@/features/admin/staff/staff-page";

export const metadata: Metadata = { title: ADMIN_TITLES.staff };

export default function Page() {
  return <StaffPage />;
}
