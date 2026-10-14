import type { Metadata } from "next";
import { OrgListPage } from "@/features/admin/orgs/org-list-page";

export const metadata: Metadata = { title: "Doanh nghiệp" };

export default function Page() {
  return <OrgListPage />;
}
