import type { Metadata } from "next";
import { StaffPage } from "@/features/admin/staff/staff-page";

export const metadata: Metadata = { title: "Quản trị viên" };

export default function Page() {
  return <StaffPage />;
}
