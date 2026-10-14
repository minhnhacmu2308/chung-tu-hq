import type { Metadata } from "next";
import { UserListPage } from "@/features/admin/users/user-list-page";

export const metadata: Metadata = { title: "Người dùng" };

export default function Page() {
  return <UserListPage />;
}
