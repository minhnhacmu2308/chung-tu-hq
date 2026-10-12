import { SkillDetailPage } from "@/features/skills/skill-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SkillDetailPage id={id} />;
}
