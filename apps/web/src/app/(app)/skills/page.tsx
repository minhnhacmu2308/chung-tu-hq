import type { Metadata } from "next";
import { SkillListPage } from "@/features/skills/skill-list-page";

export const metadata: Metadata = { title: "Cấu hình Skill AI" };

export default function Page() {
  return <SkillListPage />;
}
