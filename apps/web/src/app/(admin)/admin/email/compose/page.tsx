import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { EmailComposePage } from "@/features/admin/email/email-compose-page";

export const metadata: Metadata = { title: ADMIN_TITLES.emailCompose };

export default function Page() {
  return <EmailComposePage />;
}
