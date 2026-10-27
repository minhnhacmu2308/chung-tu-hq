import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { TeachPage } from "@/features/teach/teach-page";

export const metadata: Metadata = { title: VI_TITLES.teach };

export default function Page() {
  return <TeachPage />;
}
