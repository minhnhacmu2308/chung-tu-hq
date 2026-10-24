import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { SkillListPage } from "@/features/skills/skill-list-page";

export const metadata: Metadata = { title: VI_TITLES.skills };

export default function Page() {
  return <SkillListPage />;
}
