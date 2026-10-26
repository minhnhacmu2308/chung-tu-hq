import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { EmailTemplateEditorPage } from "@/features/admin/email/email-template-editor-page";

export const metadata: Metadata = { title: ADMIN_TITLES.emailTemplates };

/** `id` = "new" → tạo mẫu mới. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmailTemplateEditorPage id={id === "new" ? null : id} />;
}
