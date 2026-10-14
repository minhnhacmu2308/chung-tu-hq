import type { Metadata } from "next";
import { PlatformIntegrationsPage } from "@/features/admin/integrations/platform-integrations-page";

export const metadata: Metadata = { title: "Tích hợp dùng chung" };

export default function Page() {
  return <PlatformIntegrationsPage />;
}
