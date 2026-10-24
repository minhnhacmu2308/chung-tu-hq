import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { OrgListPage } from "@/features/admin/orgs/org-list-page";

export const metadata: Metadata = { title: ADMIN_TITLES.orgs };

export default function Page() {
  return <OrgListPage />;
}
