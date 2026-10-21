import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { SkillTemplatesPage } from "@/features/admin/skill-templates/skill-templates-page";

export const metadata: Metadata = { title: ADMIN_TITLES.skillTemplates };

export default function Page() {
  return <SkillTemplatesPage />;
}
