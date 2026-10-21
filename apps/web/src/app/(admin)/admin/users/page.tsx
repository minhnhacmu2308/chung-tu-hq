import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { UserListPage } from "@/features/admin/users/user-list-page";

export const metadata: Metadata = { title: ADMIN_TITLES.users };

export default function Page() {
  return <UserListPage />;
}
