import type { Metadata } from "next";
import { DossierListPage } from "@/features/dossiers/dossier-list-page";

export const metadata: Metadata = { title: "Hồ sơ khai báo" };

export default function Page() {
  return <DossierListPage />;
}
