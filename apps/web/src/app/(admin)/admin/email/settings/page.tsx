import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { MailSettingsPage } from "@/features/admin/email/mail-settings-page";

export const metadata: Metadata = { title: ADMIN_TITLES.mailSettings };

export default function Page() {
  return <MailSettingsPage />;
}
