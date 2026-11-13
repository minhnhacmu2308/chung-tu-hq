import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { CatalogPage } from "@/features/catalog/catalog-page";

export const metadata: Metadata = { title: VI_TITLES.products };

export default function Page() {
  return <CatalogPage />;
}
