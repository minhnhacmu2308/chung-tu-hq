import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { EmailSignaturesPage } from "@/features/admin/email/email-signatures-page";

export const metadata: Metadata = { title: ADMIN_TITLES.emailSignatures };

export default function Page() {
  return <EmailSignaturesPage />;
}
