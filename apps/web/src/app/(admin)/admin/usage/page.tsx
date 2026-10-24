import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { UsagePage } from "@/features/admin/usage/usage-page";

export const metadata: Metadata = { title: ADMIN_TITLES.usage };

export default function Page() {
  return <UsagePage />;
}
