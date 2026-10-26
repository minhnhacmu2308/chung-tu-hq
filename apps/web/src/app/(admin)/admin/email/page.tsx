import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { EmailCampaignsPage } from "@/features/admin/email/email-campaigns-page";

export const metadata: Metadata = { title: ADMIN_TITLES.emailCampaigns };

export default function Page() {
  return <EmailCampaignsPage />;
}
