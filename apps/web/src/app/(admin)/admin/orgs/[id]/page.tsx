import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { OrgDetailPage } from "@/features/admin/orgs/org-detail-page";

export const metadata: Metadata = { title: ADMIN_TITLES.orgs };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrgDetailPage id={id} />;
}
