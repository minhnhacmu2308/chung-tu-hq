import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { EmailTemplatesPage } from "@/features/admin/email/email-templates-page";

export const metadata: Metadata = { title: ADMIN_TITLES.emailTemplates };

export default function Page() {
  return <EmailTemplatesPage />;
}
