import type { Metadata } from "next";
import { OrgDetailPage } from "@/features/admin/orgs/org-detail-page";

export const metadata: Metadata = { title: "Doanh nghiệp" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrgDetailPage id={id} />;
}
