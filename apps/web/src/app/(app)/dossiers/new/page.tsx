import type { Metadata } from "next";
import { CreateDossierPage } from "@/features/dossiers/create-dossier-page";

export const metadata: Metadata = { title: "Tạo hồ sơ" };

export default function Page() {
  return <CreateDossierPage />;
}
