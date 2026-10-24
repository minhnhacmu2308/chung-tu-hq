import type { Metadata } from "next";
import { VI_TITLES } from "@/app/app-titles.messages";
import { SettingsPage } from "@/features/settings/settings-page";

export const metadata: Metadata = { title: VI_TITLES.settings };

export default function Page() {
  return <SettingsPage />;
}
