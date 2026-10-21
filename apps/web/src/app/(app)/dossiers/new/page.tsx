import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { CreateDossierPage } from "@/features/dossiers/create-dossier-page";

export const metadata: Metadata = { title: VI_TITLES.newDossier };

export default function Page() {
  return <CreateDossierPage />;
}
