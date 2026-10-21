import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { PlatformIntegrationsPage } from "@/features/admin/integrations/platform-integrations-page";

export const metadata: Metadata = { title: ADMIN_TITLES.integrations };

export default function Page() {
  return <PlatformIntegrationsPage />;
}
