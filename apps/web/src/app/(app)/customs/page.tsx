import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { CustomsPage } from "@/features/customs/customs-page";

export const metadata: Metadata = { title: VI_TITLES.customs };

export default function Page() {
  return <CustomsPage />;
}
