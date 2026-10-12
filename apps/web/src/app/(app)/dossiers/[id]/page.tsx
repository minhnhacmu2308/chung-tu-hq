import { DossierDetailPage } from "@/features/dossier-detail/dossier-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DossierDetailPage id={id} />;
}
