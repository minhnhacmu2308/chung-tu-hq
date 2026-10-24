import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { DossierListPage } from "@/features/dossiers/dossier-list-page";

export const metadata: Metadata = { title: VI_TITLES.dossiers };

export default function Page() {
  return <DossierListPage />;
}
