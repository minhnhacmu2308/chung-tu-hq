import type { Metadata } from "next";
import { SkillTemplatesPage } from "@/features/admin/skill-templates/skill-templates-page";

export const metadata: Metadata = { title: "Skill mẫu" };

export default function Page() {
  return <SkillTemplatesPage />;
}
