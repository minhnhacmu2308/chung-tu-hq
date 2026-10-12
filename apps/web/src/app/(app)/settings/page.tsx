import type { Metadata } from "next";
import { SettingsPage } from "@/features/settings/settings-page";

export const metadata: Metadata = { title: "Tài khoản & tích hợp" };

export default function Page() {
  return <SettingsPage />;
}
